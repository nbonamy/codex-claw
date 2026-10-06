import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import product from '../core/src/product.json' with { type: 'json' };
import { requiredJobs, workflow, validateIdentity, verifyArtifacts } from './release-contract.mjs';
import { createReleaseProgress, failureExcerpt } from './release-progress.mjs';

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
    timeout: args[0] === 'run' && args[1] === 'download' ? 900_000 : 60_000 });
}
function api(route, paginate = false) {
  return JSON.parse(gh(['api', route, ...(paginate ? ['--paginate', '--slurp'] : [])]));
}
function save(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}
function validateState(state) {
  validateIdentity({ ...state, runId: state.runId ?? 1 });
  if (state.repository !== product.repository || !/^[a-f0-9]{32}$/.test(state.requestId)
    || !/^[a-f0-9]{40}$/.test(state.workflowSha) || !['none', 'prerelease', 'latest'].includes(state.channel)
    || !Number.isFinite(Date.parse(state.createdAt))) throw new Error('Invalid dispatch state.');
}
function title(state) { return `desktop ${state.version} ${state.channel} ${state.requestId}`; }

async function monitor(state, statePath, timeout, attempt, resumeCommand) {
  const deadline = Date.now() + timeout * 1000;
  const base = `repos/${state.repository}/actions`;
  const expectedTitle = title(state);
  const jobNames = state.channel === 'none' ? requiredJobs.filter(name => name !== 'publish') : requiredJobs;
  const persist = () => save(statePath, state);
  const progress = createReleaseProgress(process.stdout, jobNames);
  while (true) {
    if (!state.runId) {
      const pages = api(`${base}/workflows/${workflow}/runs?event=workflow_dispatch&head_sha=${state.workflowSha}&per_page=100&created=${encodeURIComponent('>=' + state.createdAt)}`, true);
      const matches = pages.flatMap(page => page.workflow_runs).filter(run => run.display_title === expectedTitle);
      if (matches.length > 1) throw new Error('Ambiguous dispatch identity; inspect Actions before continuing.');
      if (matches.length === 1) { state.runId = matches[0].id; persist(); }
    }
    if (state.runId) {
      const run = api(`${base}/runs/${state.runId}`);
      if (run.head_sha !== state.workflowSha || run.display_title !== expectedTitle || run.event !== 'workflow_dispatch'
        || run.path !== `.github/workflows/${workflow}`) throw new Error('Workflow identity mismatch (SHA/version/request/workflow).');
      if (attempt !== undefined) {
        if (attempt !== run.run_attempt) throw new Error(`Requested attempt ${attempt} is not the current attempt ${run.run_attempt}.`);
        state.attempt = attempt; persist();
      }
      const attemptFlag = '--attempt';
      if (run.run_attempt !== state.attempt) throw new Error(`Run attempt changed to ${run.run_attempt}; resume explicitly with: ${resumeCommand} ${attemptFlag} ${run.run_attempt}. Rerun ALL jobs.`);
      const jobs = api(`${base}/runs/${state.runId}/attempts/${state.attempt}/jobs?per_page=100`, true).flatMap(page => page.jobs);
      progress(state, run, jobs);
      if (run.status === 'completed') {
        if (run.conclusion !== 'success') {
          for (const job of jobs.filter(job => jobNames.includes(job.name) && job.status === 'completed'
            && !['success', 'skipped', 'neutral'].includes(job.conclusion))) {
            const args = ['run', 'view', String(state.runId), '--repo', state.repository,
              '--attempt', String(state.attempt), '--job', String(job.id), '--log-failed'];
            console.log(`\nFailure details: ${job.name}`);
            try { console.log(failureExcerpt(gh(args)) || 'No failed-step logs available.'); }
            catch { console.log('Logs unavailable from GitHub.'); }
            console.log(`Full logs: gh ${args.join(' ')}`);
          }
          console.log(`\nRetry all jobs: gh run rerun ${state.runId} --repo ${state.repository}`);
          console.log(`Resume: ${resumeCommand} ${attemptFlag} ${state.attempt + 1}`);
          throw new Error(`Required build unsuccessful: ${run.conclusion}.`);
        }
        for (const name of jobNames) {
          const matching = jobs.filter(job => job.name === name);
          if (matching.length !== 1 || matching[0].status !== 'completed' || matching[0].conclusion !== 'success') {
            throw new Error(`Required job missing or unsuccessful: ${name}. Rerun ALL jobs to produce one complete attempt.`);
          }
        }
        return;
      }
    }
    if (Date.now() >= deadline) throw new Error(`Timed out ${state.runId ? 'waiting for required builds' : 'discovering dispatched run'}. Resume with: ${resumeCommand}`);
    await delay(Math.min(10_000, Math.max(1, deadline - Date.now())));
  }
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    tag: { type: 'string' }, state: { type: 'string' },
    timeout: { type: 'string', default: '7200' }, attempt: { type: 'string' },
    output: { type: 'string' }, help: { type: 'boolean' },
  } });
  const command = positionals[0];
  if (values.help || !command) {
    console.log('Usage: npm run release:build -- --tag <existing-remote-tag> [--state file]\n'
      + '       npm run release:monitor -- [--state file] [--attempt N] [--timeout seconds]\n'
      + '       npm run release:download -- [--state file] [--output directory]\n'
      + '       npm run prerelease\n'
      + '       npm run latest\n'
      + 'Shortcuts use package.json version; one GitHub workflow builds and publishes.\n'
      + 'Optional overrides: --tag v<version> or --state file. Existing receipts resume without rebuilding.\n'
      + 'Build-only dispatch never publishes.');
    return;
  }
  if (positionals.length !== 1 || !['dispatch', 'monitor', 'download', 'prerelease', 'latest'].includes(command)) throw new Error('Unknown release command. Use --help.');
  const pipeline = command === 'prerelease' || command === 'latest';
  if (values.output && command !== 'download') throw new Error('--output is only for explicit release:download; publication stays on GitHub.');
  if (pipeline && !values.tag && !values.state) {
    const version = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).version;
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A prepared package.json release version is required.');
    values.tag = `v${version}`;
  }
  if (pipeline && values.tag && !/^v\d+\.\d+\.\d+$/.test(values.tag)) throw new Error('Publication requires a canonical v<version> tag.');
  const statePath = path.resolve(values.state ?? (pipeline && values.tag ? `.release/${values.tag}-${command}.json` : '.release/state.json'));
  const timeout = Number(values.timeout);
  const attempt = values.attempt === undefined ? undefined : Number(values.attempt);
  if (!Number.isFinite(timeout) || timeout < 0 || (attempt !== undefined && (!Number.isSafeInteger(attempt) || attempt < 1))) throw new Error('Invalid timeout/attempt.');
  let state;
  if (command === 'dispatch' || (pipeline && values.tag && !fs.existsSync(statePath))) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.tag ?? '')) throw new Error('An existing immutable tag is required.');
    if (fs.existsSync(statePath)) throw new Error(`State already exists: ${statePath}. Resume it or choose a new --state file.`);
    const repository = product.repository;
    api(`repos/${repository}/git/ref/tags/${values.tag}`); // Reject moving branch refs.
    const commit = api(`repos/${repository}/commits/${values.tag}`);
    const pkg = api(`repos/${repository}/contents/package.json?ref=${commit.sha}`);
    const version = JSON.parse(Buffer.from(pkg.content, 'base64').toString('utf8')).version;
    if (pipeline && values.tag !== `v${version}`) throw new Error('Release tag does not match its package version.');
    const branch = api(`repos/${repository}`).default_branch;
    const workflowSha = api(`repos/${repository}/commits/${encodeURIComponent(branch)}`).sha;
    state = { workflowSha, channel: pipeline ? command : 'none', repository, tag: values.tag, sha: commit.sha, version, requestId: randomBytes(16).toString('hex'),
      runId: null, attempt: 1, createdAt: new Date(Date.now() - 60_000).toISOString() };
    validateState(state);
    save(statePath, state); // Persist before dispatch, including on ambiguous network failure.
    gh(['workflow', 'run', workflow, '--repo', repository, '--ref', branch,
      '-f', `sha=${state.sha}`, '-f', `version=${version}`, '-f', `tag=${state.tag}`, '-f', `request_id=${state.requestId}`, '-f', `channel=${state.channel}`]);
    console.log(`Dispatched ${state.tag} at ${state.sha}; resume with --state ${statePath}`);
  } else {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    validateState(state);
    if (pipeline && state.channel !== command) throw new Error('Saved run has a different release channel. Use the matching command.');
    if (values.tag && values.tag !== state.tag) throw new Error('Requested tag does not match the saved receipt tag.');
  }
  if (pipeline && state.tag !== `v${state.version}`) throw new Error('Publication requires a canonical v<version> tag.');
  const resumeCommand = `npm run ${pipeline ? command : 'release:monitor'} -- --state ${JSON.stringify(statePath)}`;
  await monitor(state, statePath, timeout, attempt, resumeCommand);
  if (pipeline) {
    const release = api(`repos/${state.repository}/releases/tags/${state.tag}`);
    if (release.draft || release.tag_name !== state.tag || release.prerelease !== (command === 'prerelease')) {
      throw new Error('Workflow completed but release visibility does not match the requested channel.');
    }
    console.log(`Published ${command}: ${product.repositoryUrl}/releases/tag/${state.tag}`);
  } else if (command === 'download') {
    const output = path.resolve(values.output ?? `.release/${state.version}-${state.runId}-${state.attempt}-${command}-${randomBytes(4).toString('hex')}`);
    if (fs.existsSync(output)) throw new Error(`Download directory already exists: ${output}. Choose a new --output directory.`);
    console.log('Downloading build artifacts from GitHub Actions…');
    gh(['run', 'download', String(state.runId), '--repo', state.repository,
      '--pattern', `desktop-*-${state.runId}-${state.attempt}`, '--dir', output]);
    await verifyArtifacts(output, state);
    console.log(`Verified all release artifacts: ${output}`);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
