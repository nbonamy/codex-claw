import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import product from '../core/src/product.json' with { type: 'json' };
import { requiredJobs, workflow, validateIdentity, verifyBundle } from './release-contract.mjs';
import { stageRelease, promote } from './promote-release.mjs';

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== product.repository) {
    throw new Error('Publication runs on GitHub only. Use npm run prerelease or npm run latest.');
  }
  const runId = Number(process.env.RELEASE_BUILD_RUN);
  const attempt = Number(process.env.RELEASE_BUILD_ATTEMPT);
  const channel = process.env.RELEASE_CHANNEL;
  if (!Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(attempt) || attempt < 1
    || !['prerelease', 'latest'].includes(channel)) throw new Error('Invalid publication inputs.');
  const gh = args => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 900_000, maxBuffer: 32 * 1024 * 1024 });
  const api = (route, paginated = false) => JSON.parse(gh(['api', `repos/${product.repository}/${route}`,
    ...(paginated ? ['--paginate', '--slurp'] : [])]));
  const run = api(`actions/runs/${runId}`);
  const tag = run.head_branch;
  if (run.path !== `.github/workflows/${workflow}` || run.event !== 'workflow_dispatch'
    || run.status !== 'completed' || run.conclusion !== 'success' || run.run_attempt !== attempt
    || !/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Build workflow, tag, attempt or result does not qualify for publication.');
  const identity = { runId, attempt, tag, version: tag.slice(1), sha: run.head_sha };
  validateIdentity(identity);
  api(`git/ref/tags/${tag}`);
  if (api(`commits/${tag}`).sha !== identity.sha) throw new Error('Remote tag no longer matches the build.');
  const jobs = api(`actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`, true).flatMap(page => page.jobs);
  for (const name of requiredJobs) {
    const matching = jobs.filter(job => job.name === name);
    if (matching.length !== 1 || matching[0].status !== 'completed' || matching[0].conclusion !== 'success') {
      throw new Error(`Required build job missing or unsuccessful: ${name}`);
    }
  }
  const artifactName = `release-${runId}-${attempt}`;
  const artifacts = api(`actions/runs/${runId}/artifacts?per_page=100`, true).flatMap(page => page.artifacts)
    .filter(artifact => artifact.name === artifactName);
  if (artifacts.length !== 1 || artifacts[0].expired) throw new Error('Exact build artifact is missing or expired.');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-publication-'));
  try {
    console.log(`Downloading ${artifactName} on the GitHub runner.`);
    gh(['run', 'download', String(runId), '--repo', product.repository, '--name', artifactName, '--dir', directory]);
    await verifyBundle(directory, identity);
    console.log('Build provenance and all platform checksums verified.');
    await stageRelease(directory, identity);
    await promote(directory, identity, { stable: channel === 'latest' });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
