import { describe, expect, it, vi } from 'vitest';
import { SshConnectionService, parseSshConfig, sshStdioTransport } from '../ssh-connections';

describe('ssh connections', () => {
  it('parses concrete hosts from ssh config', () => {
    expect(parseSshConfig(`
Host *
  User ignored

Host devbox dev-2
  HostName devbox.internal
  User nicolas
  Port 2222
  IdentityFile ~/.ssh/id_devbox

Host *.wild !blocked
  HostName ignored

Host bad;alias
  HostName ignored
`, '/Users/nicolas/.ssh/config')).toStrictEqual([
      {
        host: 'dev-2',
        hostName: 'devbox.internal',
        user: 'nicolas',
        port: 2222,
        identityFile: '~/.ssh/id_devbox',
        configPath: '/Users/nicolas/.ssh/config',
        line: 5,
      },
      {
        host: 'devbox',
        hostName: 'devbox.internal',
        user: 'nicolas',
        port: 2222,
        identityFile: '~/.ssh/id_devbox',
        configPath: '/Users/nicolas/.ssh/config',
        line: 5,
      },
    ]);
  });

  it('returns an empty host list when ssh config is missing', async () => {
    const service = new SshConnectionService({
      homedir: () => '/Users/nicolas',
      readFile: vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
    });

    await expect(service.listHostCandidates()).resolves.toStrictEqual([]);
  });

  it('syncs the clawd package and stores the daemon-first stdio transport', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === 'ssh' && args.at(-1)?.includes('--version')) {
        return { stdout: 'clawd 0.1.0\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const service = new SshConnectionService({
      accessFile: vi.fn().mockResolvedValue(undefined),
      assetsPath: '/Applications/Codex Claw.app/Contents/Resources',
      createId: () => 'connection-devbox',
      now: () => new Date('2026-06-14T10:00:00.000Z'),
      providerTokensFilePath: '/Users/nicolas/.codex-claw/provider-tokens.json',
      run,
    });

    await expect(service.createConnection({
      host: 'devbox',
      hostName: 'devbox.internal',
      user: 'nicolas',
      port: 2222,
    })).resolves.toStrictEqual({
      id: 'connection-devbox',
      kind: 'ssh',
      name: 'devbox',
      host: 'devbox',
      hostName: 'devbox.internal',
      user: 'nicolas',
      port: 2222,
      status: 'ready',
      detail: 'Ready (clawd 0.1.0)',
      transport: sshStdioTransport('devbox'),
      installedAt: '2026-06-14T10:00:00.000Z',
      lastCheckedAt: '2026-06-14T10:00:00.000Z',
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    });

    expect(run).toHaveBeenCalledWith('scp', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      '/Applications/Codex Claw.app/Contents/Resources/clawd/clawd.mjs',
      'devbox:~/.codex-claw/clawd.mjs.tmp',
    ], { timeoutMs: 15000 });
    expect(run).toHaveBeenCalledWith('scp', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      '/Users/nicolas/.codex-claw/provider-tokens.json',
      'devbox:~/.codex-claw/provider-tokens.json.tmp',
    ], { timeoutMs: 15000 });
    expect(run).toHaveBeenCalledWith('ssh', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      'devbox',
      `mv ~/.codex-claw/provider-tokens.json.tmp ~/.codex-claw/provider-tokens.json && chmod 600 ~/.codex-claw/provider-tokens.json`,
    ], { timeoutMs: 15000 });
    expect(run.mock.calls.some(([command, args]) => (
      command === 'ssh' &&
      args.some((arg) => arg.includes('pkill') || arg.includes('killall'))
    ))).toBe(false);
  });

  it('prefers a remote daemon socket before falling back to one-shot stdio', () => {
    expect(sshStdioTransport('devbox')).toStrictEqual({
      type: 'ssh-stdio',
      command: 'ssh',
      args: [
        'devbox',
        'node ~/.codex-claw/clawd.mjs connect || exec node ~/.codex-claw/clawd.mjs --stdio',
      ],
    });
  });

  it('removes remote provider tokens when no local token file exists', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === 'ssh' && args.at(-1)?.includes('--version')) {
        return { stdout: 'clawd 0.1.0\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const accessFile = vi.fn(async (filePath: string) => {
      if (filePath.endsWith('provider-tokens.json')) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
    });
    const service = new SshConnectionService({
      accessFile,
      assetsPath: '/Applications/Codex Claw.app/Contents/Resources',
      createId: () => 'connection-devbox',
      now: () => new Date('2026-06-14T10:00:00.000Z'),
      providerTokensFilePath: '/Users/nicolas/.codex-claw/provider-tokens.json',
      run,
    });

    await expect(service.createConnection({ host: 'devbox' })).resolves.toMatchObject({
      status: 'ready',
    });

    expect(run).toHaveBeenCalledWith('ssh', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      'devbox',
      'rm -f ~/.codex-claw/provider-tokens.json',
    ], { timeoutMs: 15000 });
  });

  it('records connection errors without throwing', async () => {
    const service = new SshConnectionService({
      accessFile: vi.fn().mockResolvedValue(undefined),
      createId: () => 'connection-devbox',
      now: () => new Date('2026-06-14T10:00:00.000Z'),
      run: vi.fn().mockRejectedValue(new Error('Permission denied (publickey).')),
    });

    await expect(service.createConnection({ host: 'devbox' })).resolves.toMatchObject({
      id: 'connection-devbox',
      host: 'devbox',
      status: 'error',
      detail: 'Permission denied (publickey).',
    });
  });
});
