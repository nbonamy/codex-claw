import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { getClawdDaemonStatus, installClawdDaemon, setClawdDaemonEnabled } from '../daemon-launch-agent';

describe('daemon launch agent', () => {
  it('reports unsupported status when no clawd runtime is available', async () => {
    await expect(getClawdDaemonStatus({
      access: vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
      connectSocket: failingSocket('connect ENOENT'),
      env: {},
      homedir: () => '/Users/nicolas',
      platform: 'darwin',
    })).resolves.toStrictEqual({
      supported: false,
      installed: false,
      running: false,
      socketPath: expect.stringContaining('.codex-claw/clawd.sock'),
      launchAgentPath: '/Users/nicolas/Library/LaunchAgents/com.codex-claw.clawd.plist',
      detail: 'No packaged clawd runtime was found.',
    });
  });

  it('reports non-macOS platforms as unsupported', async () => {
    await expect(getClawdDaemonStatus({
      access: vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
      connectSocket: failingSocket('connect ENOENT'),
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'node',
      },
      homedir: () => '/Users/nicolas',
      platform: 'linux',
    })).resolves.toMatchObject({
      supported: false,
      installed: false,
      running: false,
      detail: 'Background daemon installation is only supported on macOS.',
    });
  });

  it('installs and starts a per-user macOS LaunchAgent for clawd serve', async () => {
    const access = vi.fn().mockResolvedValue(undefined);
    const execFile = vi.fn().mockResolvedValue({});
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const writeFile = vi.fn().mockResolvedValue(undefined);

    await expect(installClawdDaemon({
      access,
      connectSocket: healthySocket(),
      defaultApp: false,
      env: {
        PATH: '/usr/bin:/Users/nicolas/.nvm/versions/node/v22.19.0/bin',
        CODEX_CLAW_GITHUB_CLIENT_ID: 'github-client-id',
        CODEX_CLAW_HOME: '/Users/nicolas/.codex-claw',
      },
      execFile,
      execFileSync: vi.fn(() => {
        throw new Error('login shell unavailable');
      }),
      existsSync: (filePath) => filePath === '/Applications/Codex Claw.app/Contents/Resources/clawd/clawd.mjs' ||
        filePath === '/Users/nicolas/.nvm/versions/node/v22.19.0/bin/node',
      getuid: () => 501,
      homedir: () => '/Users/nicolas',
      mkdir,
      platform: 'darwin',
      resourcesPath: '/Applications/Codex Claw.app/Contents/Resources',
      writeFile,
    })).resolves.toMatchObject({
      supported: true,
      installed: true,
      running: true,
      launchAgentPath: '/Users/nicolas/Library/LaunchAgents/com.codex-claw.clawd.plist',
      socketPath: '/Users/nicolas/.codex-claw/clawd.sock',
    });

    expect(mkdir).toHaveBeenCalledWith('/Users/nicolas/Library/LaunchAgents', { recursive: true });
    expect(mkdir).toHaveBeenCalledWith('/Users/nicolas/Library/Logs/Codex Claw', { recursive: true });
    expect(mkdir).toHaveBeenCalledWith('/Users/nicolas/.codex-claw', { recursive: true, mode: 0o700 });
    expect(writeFile).toHaveBeenCalledWith(
      '/Users/nicolas/Library/LaunchAgents/com.codex-claw.clawd.plist',
      expect.stringContaining('<string>/Users/nicolas/.nvm/versions/node/v22.19.0/bin/node</string>'),
    );

    const plist = writeFile.mock.calls[0][1] as string;
    expect(plist).toContain('<string>/Applications/Codex Claw.app/Contents/Resources/clawd/clawd.mjs</string>');
    expect(plist).toContain('<string>serve</string>');
    expect(plist).toContain('<key>CODEX_CLAW_HOME</key>');
    expect(plist).toContain('<string>/Users/nicolas/.codex-claw</string>');
    expect(plist).toContain('<key>HOME</key>');
    expect(plist).toContain('<string>/Users/nicolas</string>');
    expect(plist).toContain('<key>CODEX_CLAW_GITHUB_CLIENT_ID</key>');
    expect(plist).toContain('<string>github-client-id</string>');
    expect(execFile).toHaveBeenNthCalledWith(1, 'launchctl', [
      'bootout',
      'gui/501',
      '/Users/nicolas/Library/LaunchAgents/com.codex-claw.clawd.plist',
    ]);
    expect(execFile).toHaveBeenNthCalledWith(2, 'launchctl', [
      'bootstrap',
      'gui/501',
      '/Users/nicolas/Library/LaunchAgents/com.codex-claw.clawd.plist',
    ]);
    expect(execFile).toHaveBeenNthCalledWith(3, 'launchctl', [
      'kickstart',
      '-k',
      'gui/501/com.codex-claw.clawd',
    ]);
  });

  it('removes the LaunchAgent when disabled', async () => {
    const execFile = vi.fn().mockResolvedValue({});
    const unlink = vi.fn().mockResolvedValue(undefined);

    await expect(setClawdDaemonEnabled(false, {
      access: vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' })),
      connectSocket: failingSocket('connect ENOENT'),
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'node',
        CODEX_CLAW_BACKEND_ARGS: '/app/clawd.mjs,--stdio',
      },
      execFile,
      getuid: () => 501,
      homedir: () => '/Users/nicolas',
      platform: 'darwin',
      unlink,
    })).resolves.toMatchObject({
      installed: false,
      running: false,
    });

    expect(execFile).toHaveBeenCalledWith('launchctl', [
      'bootout',
      'gui/501',
      '/Users/nicolas/Library/LaunchAgents/com.codex-claw.clawd.plist',
    ]);
    expect(unlink).toHaveBeenCalledWith('/Users/nicolas/Library/LaunchAgents/com.codex-claw.clawd.plist');
  });
});

function healthySocket() {
  return vi.fn(() => {
    const socket = fakeSocket();
    socket.write = vi.fn(() => {
      queueMicrotask(() => {
        socket.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: 1, result: { version: '0.1.0', pid: 123 } })}\n`);
      });
      return true;
    }) as never;
    queueMicrotask(() => socket.emit('connect'));
    return socket;
  }) as never;
}

function failingSocket(message: string) {
  return vi.fn(() => {
    const socket = fakeSocket();
    queueMicrotask(() => socket.emit('error', new Error(message)));
    return socket;
  }) as never;
}

function fakeSocket(): Socket {
  const socket = new EventEmitter() as Socket;
  socket.setTimeout = vi.fn() as never;
  socket.destroy = vi.fn() as never;
  socket.write = vi.fn() as never;
  return socket;
}
