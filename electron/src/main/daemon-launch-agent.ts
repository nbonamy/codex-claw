import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import net, { type Socket } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import type { ClawdDaemonStatus } from '@codex-claw/core/contracts';
import { runtimeClawdCommand, runtimeClawdHome, runtimeClawdServeCommand, runtimeClawdSocketPath, type RuntimeClawdConfigDeps, type RuntimeClawdCommand } from './runtime-config';

const execFile = promisify(execFileCallback);
const launchAgentLabel = 'com.nabocorp.codex-claw.clawd';

type ExecFileResult = {
  stdout?: string | Buffer;
};
type ExecFile = (file: string, args: string[]) => Promise<ExecFileResult>;

export type DaemonLaunchAgentDependencies = RuntimeClawdConfigDeps & {
  access?: typeof access;
  connectSocket?: typeof net.createConnection;
  execFile?: ExecFile;
  getuid?: () => number;
  homedir?: () => string;
  mkdir?: typeof mkdir;
  platform?: NodeJS.Platform;
  unlink?: typeof unlink;
  writeFile?: typeof writeFile;
};

type ResolvedLaunchAgent = {
  command: RuntimeClawdCommand | null;
  homeDir: string;
  launchAgentPath: string;
  logDir: string;
  socketPath: string;
};

export async function getClawdDaemonStatus(
  dependencies: DaemonLaunchAgentDependencies = {},
): Promise<ClawdDaemonStatus> {
  const resolved = resolveLaunchAgent(dependencies);
  const installed = await pathExists(resolved.launchAgentPath, dependencies);
  const health = await probeClawdSocket(resolved.socketPath, dependencies);
  const command = resolved.command;
  const platformSupported = isSupportedPlatform(dependencies);
  const supported = platformSupported && Boolean(command);

  return {
    supported,
    installed,
    running: health.ok,
    socketPath: resolved.socketPath,
    launchAgentPath: resolved.launchAgentPath,
    ...(health.version ? { version: health.version } : {}),
    ...(typeof health.pid === 'number' ? { pid: health.pid } : {}),
    detail: statusDetail({ command, health, platformSupported }),
  };
}

export async function setClawdDaemonEnabled(
  enabled: boolean,
  dependencies: DaemonLaunchAgentDependencies = {},
): Promise<ClawdDaemonStatus> {
  if (enabled) {
    return installClawdDaemon(dependencies);
  }

  return uninstallClawdDaemon(dependencies);
}

export async function installClawdDaemon(
  dependencies: DaemonLaunchAgentDependencies = {},
): Promise<ClawdDaemonStatus> {
  const resolved = resolveLaunchAgent(dependencies);
  if (!isSupportedPlatform(dependencies)) {
    throw new Error('clawd background daemon installation is only supported on macOS.');
  }
  if (!resolved.command) {
    throw new Error('No clawd runtime is available to install as a background daemon.');
  }

  await (dependencies.mkdir ?? mkdir)(path.dirname(resolved.launchAgentPath), { recursive: true });
  await (dependencies.mkdir ?? mkdir)(resolved.logDir, { recursive: true });
  await (dependencies.mkdir ?? mkdir)(resolved.homeDir, { recursive: true, mode: 0o700 });
  await (dependencies.writeFile ?? writeFile)(resolved.launchAgentPath, launchAgentPlist(resolved));
  await launchctl(['bootout', launchctlDomain(dependencies), resolved.launchAgentPath], dependencies).catch(() => undefined);
  await launchctl(['bootstrap', launchctlDomain(dependencies), resolved.launchAgentPath], dependencies);
  await launchctl(['kickstart', '-k', launchctlServiceTarget(dependencies)], dependencies);
  return getClawdDaemonStatus(dependencies);
}

export async function refreshClawdDaemon(
  dependencies: DaemonLaunchAgentDependencies = {},
): Promise<ClawdDaemonStatus> {
  return installClawdDaemon(dependencies);
}

export async function getResolvedClawdVersion(
  dependencies: DaemonLaunchAgentDependencies = {},
): Promise<string | null> {
  const command = runtimeClawdCommand(dependencies);
  if (!command) {
    return null;
  }

  const result = await (dependencies.execFile ?? execFile)(command.command, versionArgsFromRuntimeArgs(command.args));
  return parseClawdVersion(result.stdout);
}

export async function uninstallClawdDaemon(
  dependencies: DaemonLaunchAgentDependencies = {},
): Promise<ClawdDaemonStatus> {
  const resolved = resolveLaunchAgent(dependencies);
  if (isSupportedPlatform(dependencies)) {
    await launchctl(['bootout', launchctlDomain(dependencies), resolved.launchAgentPath], dependencies).catch(() => undefined);
  }
  await (dependencies.unlink ?? unlink)(resolved.launchAgentPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });
  return getClawdDaemonStatus(dependencies);
}

function resolveLaunchAgent(dependencies: DaemonLaunchAgentDependencies): ResolvedLaunchAgent {
  const userHome = (dependencies.homedir ?? homedir)();
  return {
    command: runtimeClawdServeCommand(dependencies),
    homeDir: runtimeClawdHome(dependencies),
    launchAgentPath: path.join(userHome, 'Library', 'LaunchAgents', `${launchAgentLabel}.plist`),
    logDir: path.join(userHome, 'Library', 'Logs', 'Codex Claw'),
    socketPath: runtimeClawdSocketPath(dependencies),
  };
}

function launchAgentPlist(resolved: ResolvedLaunchAgent): string {
  if (!resolved.command) {
    throw new Error('Cannot build a LaunchAgent plist without a clawd command.');
  }

  const env = {
    ...resolved.command.env,
    CODEX_CLAW_HOME: resolved.homeDir,
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(launchAgentLabel)}</string>
  <key>ProgramArguments</key>
  <array>
${plistStringArray([resolved.command.command, ...resolved.command.args])}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${plistStringDictionary(env)}
  </dict>
  <key>WorkingDirectory</key>
  <string>${escapeXml(resolved.homeDir)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(resolved.logDir, 'clawd.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(resolved.logDir, 'clawd.err.log'))}</string>
</dict>
</plist>
`;
}

function plistStringArray(values: string[]): string {
  return values.map((value) => `    <string>${escapeXml(value)}</string>`).join('\n');
}

function plistStringDictionary(values: NodeJS.ProcessEnv): string {
  return Object.entries(values)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => `    <key>${escapeXml(key)}</key>\n    <string>${escapeXml(value)}</string>`)
    .join('\n');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function pathExists(filePath: string, dependencies: DaemonLaunchAgentDependencies): Promise<boolean> {
  try {
    await (dependencies.access ?? access)(filePath);
    return true;
  } catch {
    return false;
  }
}

async function launchctl(args: string[], dependencies: DaemonLaunchAgentDependencies): Promise<void> {
  await (dependencies.execFile ?? execFile)('launchctl', args);
}

function launchctlDomain(dependencies: DaemonLaunchAgentDependencies): string {
  return `gui/${userId(dependencies)}`;
}

function launchctlServiceTarget(dependencies: DaemonLaunchAgentDependencies): string {
  return `${launchctlDomain(dependencies)}/${launchAgentLabel}`;
}

function userId(dependencies: DaemonLaunchAgentDependencies): number {
  return dependencies.getuid?.() ?? process.getuid?.() ?? 501;
}

function isSupportedPlatform(dependencies: DaemonLaunchAgentDependencies): boolean {
  return (dependencies.platform ?? process.platform) === 'darwin';
}

function statusDetail(options: {
  command: RuntimeClawdCommand | null;
  health: ClawdHealthProbe;
  platformSupported: boolean;
}): string | undefined {
  if (!options.platformSupported) {
    return 'Background daemon installation is only supported on macOS.';
  }
  if (!options.command) {
    return 'No packaged clawd runtime was found.';
  }
  if (!options.health.ok && options.health.error) {
    return options.health.error;
  }
  return undefined;
}

type ClawdHealthProbe = {
  ok: boolean;
  error?: string;
  version?: string;
  pid?: number;
};

function probeClawdSocket(
  socketPath: string,
  dependencies: DaemonLaunchAgentDependencies,
): Promise<ClawdHealthProbe> {
  return new Promise((resolve) => {
    const socket = (dependencies.connectSocket ?? net.createConnection)(socketPath);
    let buffer = '';
    let done = false;

    const finish = (result: ClawdHealthProbe) => {
      if (done) {
        return;
      }
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1_000);
    socket.once('connect', () => {
      socket.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: backendMethods.backendHealthGet })}\n`);
    });
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex < 0) {
        return;
      }

      try {
        const message = JSON.parse(buffer.slice(0, newlineIndex));
        const result = message?.result;
        finish({
          ok: message?.id === 1 && Boolean(result) && !message.error,
          ...(typeof result?.version === 'string' ? { version: result.version } : {}),
          ...(typeof result?.pid === 'number' ? { pid: result.pid } : {}),
        });
      } catch (error) {
        finish({ ok: false, error: error instanceof Error ? error.message : 'Invalid daemon health response.' });
      }
    });
    socket.once('timeout', () => finish({ ok: false, error: 'clawd daemon health check timed out.' }));
    socket.once('error', (error) => finish({ ok: false, error: error.message }));
  });
}

function versionArgsFromRuntimeArgs(args: string[]): string[] {
  const modeIndex = args.findIndex((arg) => arg === '--stdio' || arg === 'serve');
  if (modeIndex >= 0) {
    return [
      ...args.slice(0, modeIndex),
      '--version',
      ...args.slice(modeIndex + 1),
    ];
  }

  return [...args, '--version'];
}

function parseClawdVersion(stdout: string | Buffer | undefined): string | null {
  const output = stdout?.toString().trim() ?? '';
  const match = /^clawd\s+(.+)$/u.exec(output);
  return match?.[1]?.trim() || null;
}
