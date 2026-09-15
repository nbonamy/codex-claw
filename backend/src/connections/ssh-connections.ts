import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { AddSshConnectionInput, RemoteConnection, SshHostCandidate } from '@codex-claw/core/contracts';
import { createEntityId } from '@codex-claw/core/ids';
import { backendProviderTokensFilePath } from '../state';
import { bundledCodexVersion } from '@codex-claw/core/codex-release';
import { remoteCodexInstallCommand, remoteCodexVersionCommand } from './remote-codex-install';

type ExecResult = {
  stdout: string;
  stderr: string;
};

export type SshConnectionDependencies = {
  accessFile?: (filePath: string, mode?: number) => Promise<void>;
  homedir?: () => string;
  readFile?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  run?: (command: string, args: string[], options?: { timeoutMs?: number }) => Promise<ExecResult>;
  now?: () => Date;
  createId?: () => string;
  assetsPath?: string;
  argv?: string[];
  providerTokensFilePath?: string;
};

const remoteClawdPath = '~/.codex-claw/clawd.mjs';
const remoteProviderTokensPath = '~/.codex-claw/provider-tokens.json';
const connectTimeoutMs = 15_000;

export class SshConnectionService {
  constructor(private readonly deps: SshConnectionDependencies = {}) {}

  async listHostCandidates(): Promise<SshHostCandidate[]> {
    const configPath = path.join((this.deps.homedir ?? homedir)(), '.ssh', 'config');
    try {
      const content = await (this.deps.readFile ?? readFile)(configPath, 'utf8');
      return parseSshConfig(content, configPath);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async createConnection(input: AddSshConnectionInput): Promise<RemoteConnection> {
    const createdAt = this.nowIso();
    const base = normalizeSshConnectionInput(input, createdAt, this.deps.createId?.() ?? createEntityId('connection'));
    return this.checkConnection(base);
  }

  async checkConnection(connection: RemoteConnection): Promise<RemoteConnection> {
    const checkedAt = this.nowIso();
    let next: RemoteConnection = {
      ...connection,
      status: 'checking',
      detail: undefined,
      updatedAt: checkedAt,
      lastCheckedAt: checkedAt,
    };

    try {
      await (this.deps.run ?? runCommand)('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', next.host, remoteCodexInstallCommand()], { timeoutMs: 360_000 });
      await this.installRemoteClawd(next.host);
      await this.syncRemoteProviderTokens(next.host);
      const clawdVersion = await this.remoteClawdVersion(next.host);
      const codexVersion = await this.remoteCodexVersion(next.host, bundledCodexVersion);
      if (codexVersion !== bundledCodexVersion) throw new Error('Remote Codex version verification failed. Check whether remote Settings overrides the Codex executable path.');
      next = {
        ...next,
        status: 'ready',
        ...(clawdVersion ? { clawdVersion } : {}),
        codexVersion,
        detail: `Ready (clawd ${clawdVersion}, Codex ${codexVersion})`,
        installedAt: checkedAt,
        transport: sshStdioTransport(next.host, codexVersion),
        updatedAt: checkedAt,
        lastCheckedAt: checkedAt,
      };
    } catch (error) {
      next = {
        ...next,
        status: 'error',
        detail: error instanceof Error ? error.message : String(error),
        transport: undefined,
        updatedAt: checkedAt,
        lastCheckedAt: checkedAt,
      };
    }

    return next;
  }

  async inspectVersions(connection: RemoteConnection): Promise<RemoteConnection> {
    const [clawdVersion, codexVersion] = await Promise.all([
      this.remoteClawdVersion(connection.host),
      this.remoteCodexVersion(connection.host, connection.codexVersion),
    ]);
    return { ...connection, clawdVersion, codexVersion,
      detail: `Ready (clawd ${clawdVersion}, Codex ${codexVersion || 'unknown'})` };
  }

  private async remoteCodexVersion(host: string, managedVersion?: string): Promise<string> {
    const result = await this.run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, remoteCodexVersionCommand(managedVersion)]);
    return /^codex-cli\s+(\S+)/u.exec(result.stdout.trim())?.[1] ?? '';
  }

  private async installRemoteClawd(host: string): Promise<void> {
    const localClawd = await this.resolveLocalClawdScript();
    await this.run('ssh', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      host,
      'mkdir -p ~/.codex-claw',
    ]);
    await this.run('scp', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      localClawd,
      `${host}:~/.codex-claw/clawd.mjs.tmp`,
    ]);
    await this.run('ssh', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      host,
      `mv ~/.codex-claw/clawd.mjs.tmp ${remoteClawdPath} && chmod 600 ${remoteClawdPath}`,
    ]);
  }

  private async syncRemoteProviderTokens(host: string): Promise<void> {
    const localProviderTokens = this.deps.providerTokensFilePath ?? backendProviderTokensFilePath();
    try {
      await (this.deps.accessFile ?? access)(localProviderTokens, fsConstants.R_OK);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        await this.run('ssh', [
          '-o',
          'BatchMode=yes',
          '-o',
          'ConnectTimeout=10',
          host,
          `rm -f ${remoteProviderTokensPath}`,
        ]);
        return;
      }
      throw error;
    }

    await this.run('scp', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      localProviderTokens,
      `${host}:~/.codex-claw/provider-tokens.json.tmp`,
    ]);
    await this.run('ssh', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      host,
      `mv ~/.codex-claw/provider-tokens.json.tmp ${remoteProviderTokensPath} && chmod 600 ${remoteProviderTokensPath}`,
    ]);
  }

  private async remoteClawdVersion(host: string): Promise<string> {
    const result = await this.run('ssh', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      host,
      `node ${remoteClawdPath} --version`,
    ]);
    return result.stdout.trim().replace(/^clawd\s+/u, '');
  }

  private async resolveLocalClawdScript(): Promise<string> {
    const candidates = [
      path.join(this.deps.assetsPath ?? process.env.CODEX_CLAW_ASSETS_PATH ?? path.resolve(process.cwd(), 'assets'), 'clawd', 'clawd.mjs'),
      this.deps.argv?.[1] ?? process.argv[1],
    ].filter((candidate): candidate is string => Boolean(candidate && candidate.endsWith('.mjs')));

    for (const candidate of candidates) {
      try {
        await (this.deps.accessFile ?? access)(candidate, fsConstants.R_OK);
        return candidate;
      } catch {
        // Try the next candidate.
      }
    }

    throw new Error('No bundled clawd script was found to install on the remote host.');
  }

  private run(command: string, args: string[]): Promise<ExecResult> {
    return (this.deps.run ?? runCommand)(command, args, { timeoutMs: connectTimeoutMs });
  }

  private nowIso(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }
}

export function parseSshConfig(content: string, configPath?: string): SshHostCandidate[] {
  const hosts: SshHostCandidate[] = [];
  let current: SshHostCandidate[] = [];

  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const parsed = parseConfigLine(rawLine);
    if (!parsed) {
      continue;
    }

    const key = parsed.key.toLowerCase();
    if (key === 'host') {
      current = parsed.value
        .split(/\s+/)
        .map((host) => host.trim())
        .filter(isConcreteHostAlias)
        .map((host) => ({
          host,
          configPath,
          line: index + 1,
        }));
      hosts.push(...current);
      continue;
    }

    if (current.length === 0) {
      continue;
    }

    for (const host of current) {
      applySshConfigOption(host, key, parsed.value);
    }
  }

  return hosts.sort((a, b) => a.host.localeCompare(b.host));
}

export function sshStdioTransport(host: string, codexVersion?: string): RemoteConnection['transport'] {
  if (codexVersion && !/^\d+\.\d+\.\d+$/u.test(codexVersion)) throw new Error('Invalid remote Codex version.');
  return {
    type: 'ssh-stdio',
    command: 'ssh',
    args: [
      host,
      codexVersion
        ? `CODEX_CLAW_BUNDLED_CODEX_PATH="$HOME/.codex-claw/codex/${codexVersion}/bin/codex" exec node ${remoteClawdPath} --stdio`
        : `node ${remoteClawdPath} connect || exec node ${remoteClawdPath} --stdio`,
    ],
  };
}

function normalizeSshConnectionInput(input: AddSshConnectionInput, now: string, id: string): RemoteConnection {
  const host = normalizeRequiredHost(input.host);
  const name = input.name?.trim() || host;
  return {
    id,
    kind: 'ssh',
    name,
    host,
    ...(input.hostName?.trim() ? { hostName: input.hostName.trim() } : {}),
    ...(input.user?.trim() ? { user: input.user.trim() } : {}),
    ...(validPort(input.port) ? { port: input.port } : {}),
    ...(input.identityFile?.trim() ? { identityFile: input.identityFile.trim() } : {}),
    status: 'saved',
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeRequiredHost(value: string): string {
  const host = value.trim();
  if (!isConcreteHostAlias(host)) {
    throw new Error('Select a concrete SSH host alias.');
  }
  return host;
}

function parseConfigLine(line: string): { key: string; value: string } | null {
  const withoutComment = stripComment(line).trim();
  if (!withoutComment) {
    return null;
  }

  const match = /^([A-Za-z][A-Za-z0-9_-]*)\s+(.*?)\s*$/.exec(withoutComment);
  if (!match) {
    return null;
  }

  return {
    key: match[1]!,
    value: unquote(match[2] ?? ''),
  };
}

function stripComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if ((char === '"' || char === "'") && line[index - 1] !== '\\') {
      quote = quote === char ? null : char;
      continue;
    }
    if (char === '#' && quote === null) {
      return line.slice(0, index);
    }
  }
  return line;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function applySshConfigOption(host: SshHostCandidate, key: string, value: string): void {
  if (key === 'hostname' && !host.hostName) {
    host.hostName = value;
  } else if (key === 'user' && !host.user) {
    host.user = value;
  } else if (key === 'port' && !host.port) {
    const port = Number(value);
    if (validPort(port)) {
      host.port = port;
    }
  } else if (key === 'identityfile' && !host.identityFile) {
    host.identityFile = value;
  }
}

function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535;
}

function isConcreteHostAlias(host: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(host);
}

function runCommand(command: string, args: string[], options: { timeoutMs?: number } = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = options.timeoutMs
      ? setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`${command} timed out.`));
      }, options.timeoutMs)
      : null;

    child.stdout?.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(error);
    });
    child.on('close', (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      const result = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      };
      if (code === 0) {
        resolve(result);
        return;
      }
      reject(new Error(result.stderr.trim() || `${command} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
