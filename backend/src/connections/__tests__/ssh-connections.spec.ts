import { product } from '@workspace/core/product';
import { describe, expect, it, vi } from 'vitest';
import { SshConnectionService, parseSshConfig, sshStdioTransport } from '../ssh-connections';
import { bundledCodexVersion } from '@workspace/core/codex-release';
import { remoteCodexVersionCommand } from '../remote-codex-install';
import { remoteClaudeVersionCommand } from '../remote-claude-install';

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

  it('syncs the daemon package and stores the daemon-first stdio transport', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === 'ssh' && args.at(-1) === remoteCodexVersionCommand()) {
        return { stdout: `codex-cli ${bundledCodexVersion}\n`, stderr: '' };
      }
      if (command === 'ssh' && args.at(-1)?.includes('--version')) {
        return { stdout: 'daemon 0.1.0\n', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const service = new SshConnectionService({
      accessFile: vi.fn().mockResolvedValue(undefined),
      assetsPath: `/Applications/${product.name}.app/Contents/Resources`,
      createId: () => 'connection-devbox',
      now: () => new Date('2026-06-14T10:00:00.000Z'),
      providerTokensFilePath: `/Users/nicolas/${product.homeDirectory}/provider-tokens.json`,
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
      daemonVersion: '0.1.0',
      codexVersion: bundledCodexVersion,
      detail: `Ready (${product.daemonName} 0.1.0, Codex ${bundledCodexVersion})`,
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
      `/Applications/${product.name}.app/Contents/Resources/daemon/daemon.mjs`,
      `devbox:~/${product.homeDirectory}/daemon.mjs.tmp`,
    ], { timeoutMs: 15000 });
    expect(run).toHaveBeenCalledWith('scp', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      `/Users/nicolas/${product.homeDirectory}/provider-tokens.json`,
      `devbox:~/${product.homeDirectory}/provider-tokens.json.tmp`,
    ], { timeoutMs: 15000 });
    expect(run).toHaveBeenCalledWith('ssh', [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=10',
      'devbox',
      `mv ~/${product.homeDirectory}/provider-tokens.json.tmp ~/${product.homeDirectory}/provider-tokens.json && chmod 600 ~/${product.homeDirectory}/provider-tokens.json`,
    ], { timeoutMs: 15000 });
    expect(run.mock.calls.some(([command, args]) => (
      command === 'ssh' &&
      args.some((arg) => arg.includes('pkill') || arg.includes('killall'))
    ))).toBe(false);
  });

  it('detects existing remote engines without installing either one', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      const remoteCommand = args.at(-1) ?? '';
      if (command === 'ssh' && remoteCommand === remoteClaudeVersionCommand()) {
        return { stdout: '2.1.283 (Claude Code)\n', stderr: '' };
      }
      if (command === 'ssh' && remoteCommand === remoteCodexVersionCommand()) {
        return { stdout: `codex-cli ${bundledCodexVersion}\n`, stderr: '' };
      }
      if (command === 'ssh' && remoteCommand.includes('--version')) {
        return { stdout: `${product.daemonName} 0.21.1\n`, stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const service = new SshConnectionService({
      accessFile: vi.fn().mockResolvedValue(undefined),
      assetsPath: `/Applications/${product.name}.app/Contents/Resources`,
      run,
    });

    const connection = await service.createConnection({ host: 'devbox' });

    expect(connection).toMatchObject({
      status: 'ready',
      detail: `Ready (${product.daemonName} 0.21.1, Codex ${bundledCodexVersion}, Claude 2.1.283)`,
    });
    expect(run).not.toHaveBeenCalledWith('ssh', expect.arrayContaining([
      'devbox', expect.stringContaining('https://claude.ai/install.sh'),
    ]), { timeoutMs: 360_000 });
  });

  it('keeps a Claude-only host ready without installing Codex', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      const remoteCommand = args.at(-1) ?? '';
      if (command === 'ssh' && remoteCommand === remoteClaudeVersionCommand()) {
        return { stdout: '2.1.283 (Claude Code)', stderr: '' };
      }
      if (command === 'ssh' && remoteCommand === remoteCodexVersionCommand()) {
        throw new Error('Codex not installed');
      }
      if (command === 'ssh' && remoteCommand.includes('--version')) {
        return { stdout: `${product.daemonName} 0.21.1\n`, stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });
    const service = new SshConnectionService({
      accessFile: vi.fn().mockResolvedValue(undefined),
      assetsPath: `/Applications/${product.name}.app/Contents/Resources`,
      run,
    });

    const connection = await service.createConnection({ host: 'devbox' });

    expect(connection).toMatchObject({
      status: 'ready',
      detail: `Ready (${product.daemonName} 0.21.1, Claude 2.1.283)`,
      transport: sshStdioTransport('devbox'),
    });
  });

  it('prefers a remote daemon socket before falling back to one-shot stdio', () => {
    expect(sshStdioTransport('devbox')).toStrictEqual({
      type: 'ssh-stdio',
      command: 'ssh',
      args: [
        'devbox',
        `node ~/${product.homeDirectory}/daemon.mjs connect || exec node ~/${product.homeDirectory}/daemon.mjs --stdio`,
      ],
    });
  });

  it('removes remote provider tokens when no local token file exists', async () => {
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === 'ssh' && args.at(-1)?.includes('bin/codex" --version')) {
        return { stdout: `codex-cli ${bundledCodexVersion}\n`, stderr: '' };
      }
      if (command === 'ssh' && args.at(-1)?.includes('--version')) {
        return { stdout: 'daemon 0.1.0\n', stderr: '' };
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
      assetsPath: `/Applications/${product.name}.app/Contents/Resources`,
      createId: () => 'connection-devbox',
      now: () => new Date('2026-06-14T10:00:00.000Z'),
      providerTokensFilePath: `/Users/nicolas/${product.homeDirectory}/provider-tokens.json`,
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
      `rm -f ~/${product.homeDirectory}/provider-tokens.json`,
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

  it('inspects versions without copying, installing, or restarting anything', async () => {
    const run = vi.fn(async (_command: string, args: string[]) => ({
      stdout: args.at(-1)?.startsWith('node ') ? 'daemon 0.19.1' : 'codex-cli 0.143.0', stderr: '',
    }));
    const service = new SshConnectionService({ run });
    const connection = { id: 'remote', kind: 'ssh' as const, host: 'devbox', name: 'Dev', status: 'ready' as const, createdAt: '', updatedAt: '' };
    await expect(service.inspectVersions(connection)).resolves.toMatchObject({ daemonVersion: '0.19.1', codexVersion: '0.143.0' });
    expect(run.mock.calls.map(([command, args]) => [command, args.at(-1)])).toEqual([
      ['ssh', `node ~/${product.homeDirectory}/daemon.mjs --version`],
      ['ssh', remoteCodexVersionCommand()],
      ['ssh', remoteClaudeVersionCommand()],
    ]);
  });

  it('reports the remote Claude version during read-only inspection when enabled', async () => {
    const run = vi.fn(async (_command: string, args: string[]) => {
      const command = args.at(-1) ?? '';
      if (command.startsWith('node ')) return { stdout: `${product.daemonName} 0.21.1\n`, stderr: '' };
      if (command.includes('codex')) return { stdout: `codex-cli ${bundledCodexVersion}\n`, stderr: '' };
      return { stdout: '2.1.283 (Claude Code)\n', stderr: '' };
    });
    const service = new SshConnectionService({ run });
    const connection = { id: 'remote', kind: 'ssh' as const, host: 'devbox', name: 'Dev', status: 'ready' as const, createdAt: '', updatedAt: '' };

    const inspected = await service.inspectVersions(connection);

    expect(inspected.detail).toBe(`Ready (${product.daemonName} 0.21.1, Codex ${bundledCodexVersion}, Claude 2.1.283)`);
    expect(run.mock.calls.some(([, args]) => (args.at(-1) ?? '').includes('claude.ai/install.sh'))).toBe(false);
  });

  it('keeps the connection ready when read-only inspection finds no Claude CLI', async () => {
    const run = vi.fn(async (_command: string, args: string[]) => {
      const command = args.at(-1) ?? '';
      if (command.startsWith('node ')) return { stdout: `${product.daemonName} 0.21.1\n`, stderr: '' };
      if (command.includes('codex')) return { stdout: `codex-cli ${bundledCodexVersion}\n`, stderr: '' };
      throw new Error('Claude Code is not installed.');
    });
    const service = new SshConnectionService({ run });
    const connection = { id: 'remote', kind: 'ssh' as const, host: 'devbox', name: 'Dev', status: 'ready' as const, createdAt: '', updatedAt: '' };

    await expect(service.inspectVersions(connection)).resolves.toMatchObject({
      status: 'ready',
      detail: `Ready (${product.daemonName} 0.21.1, Codex ${bundledCodexVersion}); Claude unavailable: Claude Code is not installed.`,
    });
  });

  it('reads only the remote Claude login state from the CLI status JSON', async () => {
    const run = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth_token', secret: 'never forward this' }),
      stderr: '',
    });
    const service = new SshConnectionService({ run });

    await expect(service.getRemoteClaudeAuthentication('wall-e')).resolves.toStrictEqual({ loggedIn: true });
    expect(run).toHaveBeenCalledWith('ssh', expect.arrayContaining(['wall-e', expect.stringContaining('auth status')]), { timeoutMs: 15_000 });
    run.mockResolvedValueOnce({ stdout: '{"loggedIn":false}', stderr: '' });
    await expect(service.getRemoteClaudeAuthentication('wall-e')).resolves.toStrictEqual({ loggedIn: false });
    run.mockResolvedValueOnce({ stdout: 'not json', stderr: '' });
    await expect(service.getRemoteClaudeAuthentication('wall-e')).rejects.toThrow('Remote Claude authentication status was unavailable.');
    run.mockRejectedValueOnce(new Error('private SSH diagnostic'));
    await expect(service.getRemoteClaudeAuthentication('wall-e')).rejects.toThrow('Remote Claude authentication status was unavailable.');
  });
});
