import { execFile as execFileCallback } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const launchAgentLabel = 'com.nabocorp.codex-claw.clawd';
const launchAgentPath = path.join(homedir(), 'Library', 'LaunchAgents', `${launchAgentLabel}.plist`);
const launchctlDomain = `gui/${process.getuid?.() ?? 501}`;
const launchctlTarget = `${launchctlDomain}/${launchAgentLabel}`;

const command = process.argv[2];

if (command !== 'start' && command !== 'stop') {
  process.stderr.write('Usage: npm run clawd:start | npm run clawd:stop\n');
  process.exit(1);
}

if (process.platform !== 'darwin') {
  process.stderr.write('clawd LaunchAgent control is only supported on macOS.\n');
  process.exit(1);
}

try {
  if (command === 'start') {
    await startLaunchAgent();
  } else {
    await stopLaunchAgent();
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

async function startLaunchAgent() {
  await assertLaunchAgentInstalled();
  const bootstrap = await launchctl(['bootstrap', launchctlDomain, launchAgentPath], { allowFailure: true });
  if (!bootstrap.ok && !isAlreadyBootstrapped(bootstrap)) {
    throw new Error(`failed to bootstrap ${launchAgentLabel}: ${bootstrap.stderr || bootstrap.stdout || bootstrap.error}`);
  }
  await launchctl(['kickstart', '-k', launchctlTarget]);
  process.stdout.write(`started ${launchAgentLabel}\n`);
}

async function stopLaunchAgent() {
  const bootout = await launchctl(['bootout', launchctlDomain, launchAgentPath], { allowFailure: true });
  if (!bootout.ok && !isAlreadyStopped(bootout)) {
    throw new Error(`failed to stop ${launchAgentLabel}: ${bootout.stderr || bootout.stdout || bootout.error}`);
  }
  process.stdout.write(`stopped ${launchAgentLabel}\n`);
}

async function assertLaunchAgentInstalled() {
  try {
    await access(launchAgentPath);
  } catch {
    throw new Error(`${launchAgentPath} does not exist. Enable the background backend in Settings first.`);
  }
}

async function launchctl(args, options = {}) {
  try {
    const { stdout, stderr } = await execFile('launchctl', args);
    return { ok: true, stdout, stderr };
  } catch (error) {
    if (!options.allowFailure) {
      throw error;
    }
    return {
      ok: false,
      stdout: error.stdout ? String(error.stdout) : '',
      stderr: error.stderr ? String(error.stderr) : '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isAlreadyBootstrapped(result) {
  const output = `${result.stderr}\n${result.stdout}\n${result.error}`;
  return output.includes('Bootstrap failed') || output.includes('service already loaded');
}

function isAlreadyStopped(result) {
  const output = `${result.stderr}\n${result.stdout}\n${result.error}`;
  return output.includes('No such process') ||
    output.includes('Could not find service') ||
    output.includes('No such file or directory') ||
    output.includes('Input/output error');
}
