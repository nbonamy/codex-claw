import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import product from '../core/src/product.json' with { type: 'json' };
import { requiredJobs, workflow, validateIdentity, verifyBundle } from './release-contract.mjs';

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
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
    || !Number.isFinite(Date.parse(state.createdAt))) throw new Error('Invalid dispatch state.');
}
function title(state) { return `desktop ${state.version} ${state.requestId}`; }

async function monitor(state, statePath, timeout, attempt) {
  const deadline = Date.now() + timeout * 1000;
  const base = `repos/${state.repository}/actions`;
  let lastOutput = '';
  while (true) {
    if (!state.runId) {
      const pages = api(`${base}/workflows/${workflow}/runs?event=workflow_dispatch&head_sha=${state.sha}&per_page=100&created=${encodeURIComponent('>=' + state.createdAt)}`, true);
      const matches = pages.flatMap(page => page.workflow_runs).filter(run => run.display_title === title(state));
      if (matches.length > 1) throw new Error('Ambiguous dispatch identity; inspect Actions before continuing.');
      if (matches.length === 1) { state.runId = matches[0].id; save(statePath, state); }
    }
    if (state.runId) {
      const run = api(`${base}/runs/${state.runId}`);
      if (run.head_sha !== state.sha || run.display_title !== title(state) || run.event !== 'workflow_dispatch'
        || run.path !== `.github/workflows/${workflow}`) throw new Error('Workflow identity mismatch (SHA/version/request/workflow).');
      if (attempt !== undefined) {
        if (attempt !== run.run_attempt) throw new Error(`Requested attempt ${attempt} is not the current attempt ${run.run_attempt}.`);
        state.attempt = attempt; save(statePath, state);
      }
      if (run.run_attempt !== state.attempt) throw new Error(`Run attempt changed to ${run.run_attempt}; resume explicitly with --attempt ${run.run_attempt}. Rerun ALL jobs.`);
      const jobs = api(`${base}/runs/${state.runId}/attempts/${state.attempt}/jobs?per_page=100`, true).flatMap(page => page.jobs);
      const lines = [run.html_url, `Attempt ${state.attempt}: ${run.status} (${run.conclusion ?? 'pending'})`];
      for (const name of requiredJobs) {
        const job = jobs.find(candidate => candidate.name === name);
        lines.push(`${name}: ${job?.conclusion ?? job?.status ?? 'waiting'}${job?.html_url ? ` ${job.html_url}` : ''}`);
        if (job?.status === 'completed' && job.conclusion !== 'success') {
          lines.push(`Logs: gh run view ${state.runId} --repo ${state.repository} --attempt ${state.attempt} --job ${job.id} --log`);
        }
      }
      const output = lines.join('\n');
      if (output !== lastOutput) { console.log(output); lastOutput = output; }
      if (run.status === 'completed') {
        if (run.conclusion !== 'success') throw new Error(`Required build unsuccessful: ${run.conclusion}.`);
        for (const name of requiredJobs) {
          const matching = jobs.filter(job => job.name === name);
          if (matching.length !== 1 || matching[0].status !== 'completed' || matching[0].conclusion !== 'success') {
            throw new Error(`Required job missing or unsuccessful: ${name}. Rerun ALL jobs to produce one complete attempt.`);
          }
        }
        return;
      }
    }
    if (Date.now() >= deadline) throw new Error(`Timed out ${state.runId ? 'waiting for required builds' : 'discovering dispatched run'}. Resume with --state ${statePath}.`);
    await delay(Math.min(10_000, Math.max(1, deadline - Date.now())));
  }
}

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    tag: { type: 'string' }, state: { type: 'string' },
    timeout: { type: 'string', default: '7200' }, attempt: { type: 'string' },
    output: { type: 'string' }, help: { type: 'boolean' }, stable: { type: 'boolean', default: false },
  } });
  const command = positionals[0];
  if (values.help || !command) {
    console.log('Usage: npm run release:build -- --tag <existing-remote-tag> [--state file]\n'
      + '       npm run release:monitor -- [--state file] [--attempt N] [--timeout seconds]\n'
      + '       npm run release:download -- [--state file] [--output directory]\n'
      + '       npm run release:stage -- [--state file] [--output directory]\n'
      + '       npm run release:promote -- [--state file] [--output directory] [--stable]\n'
      + '       npm run prerelease -- --tag v<version> [--state file]\n'
      + '       npm run latest -- --tag v<version> [--state file]\n'
      + 'Shortcuts build, monitor, verify, stage and publish; an existing receipt resumes without rebuilding.\n'
      + 'Build-only dispatch never publishes. Low-level promotion defaults to prerelease unless --stable is explicit.');
    return;
  }
  if (positionals.length !== 1 || !['dispatch', 'monitor', 'download', 'stage', 'promote', 'prerelease', 'latest'].includes(command)) throw new Error('Unknown release command. Use --help.');
  if (values.stable && command !== 'promote') throw new Error('--stable is only valid for explicit promotion.');
  const pipeline = command === 'prerelease' || command === 'latest';
  if (pipeline && values.tag && !/^v\d+\.\d+\.\d+$/.test(values.tag)) throw new Error('Publication requires a canonical v<version> tag.');
  const statePath = path.resolve(values.state ?? (pipeline && values.tag ? `.release/${values.tag}.json` : '.release/state.json'));
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
    state = { repository, tag: values.tag, sha: commit.sha, version, requestId: randomBytes(16).toString('hex'),
      runId: null, attempt: 1, createdAt: new Date(Date.now() - 60_000).toISOString() };
    validateState(state);
    save(statePath, state); // Persist before dispatch, including on ambiguous network failure.
    gh(['workflow', 'run', workflow, '--repo', repository, '--ref', state.tag,
      '-f', `sha=${state.sha}`, '-f', `version=${version}`, '-f', `tag=${state.tag}`, '-f', `request_id=${state.requestId}`]);
    console.log(`Dispatched ${state.tag} at ${state.sha}; resume with --state ${statePath}`);
  } else {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    validateState(state);
    if (values.tag && values.tag !== state.tag) throw new Error('Requested tag does not match the saved receipt tag.');
  }
  if (pipeline && state.tag !== `v${state.version}`) throw new Error('Publication requires a canonical v<version> tag.');
  await monitor(state, statePath, timeout, attempt);
  if (pipeline || ['download', 'stage', 'promote'].includes(command)) {
    const output = path.resolve(values.output ?? `.release/${state.version}-${state.runId}-${state.attempt}-${command}-${randomBytes(4).toString('hex')}`);
    if (fs.existsSync(output)) throw new Error(`Download directory already exists: ${output}. Choose a new --output directory.`);
    gh(['run', 'download', String(state.runId), '--repo', state.repository,
      '--name', `release-${state.runId}-${state.attempt}`, '--dir', output]);
    await verifyBundle(output, state);
    console.log(`Verified all release artifacts: ${output}`);
    if (pipeline || command === 'stage' || command === 'promote') {
      const { stageRelease, promote } = await import('./promote-release.mjs');
      if (pipeline || command === 'stage') await stageRelease(output, state);
      if (pipeline || command === 'promote') await promote(output, state, { stable: command === 'latest' || values.stable });
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
