import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('runtime config', () => {
  it('returns null when no backend command is configured', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: true,
      resourcesPath: '/app/resources',
    })).toBeNull();
  });

  it('reads the backend command and comma-separated args from the environment', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      cwd: process.cwd(),
      env: {
        CODEX_CLAW_BACKEND_COMMAND: ' node ',
        CODEX_CLAW_BACKEND_ARGS: ' dist/clawd.mjs, --stdio ',
      },
    })).toStrictEqual({
      command: 'node',
      args: ['dist/clawd.mjs', '--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
      },
    });
  });

  it('defaults backend args to stdio mode', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      cwd: process.cwd(),
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'clawd',
      },
    })).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
      },
    });
  });

  it('forwards the GitHub OAuth client ID when Electron starts clawd with one in its environment', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      cwd: process.cwd(),
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'clawd',
        CODEX_CLAW_GITHUB_CLIENT_ID: ' github-client-id ',
      },
    })).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
        CODEX_CLAW_GITHUB_CLIENT_ID: 'github-client-id',
      },
    });
  });

  it('forwards an explicitly configured assets path to clawd', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'clawd',
        CODEX_CLAW_ASSETS_PATH: '/app/resources',
      },
    })).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: '/app/resources',
      },
    });
  });

  it('resolves the packaged clawd runtime from resources when no env command is configured', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: false,
      env: {},
      existsSync: (filePath) => filePath === '/app/resources/clawd/node' || filePath === '/app/resources/clawd/clawd.mjs',
      resourcesPath: '/app/resources',
    })).toStrictEqual({
      command: '/app/resources/clawd/node',
      args: [
        '/app/resources/clawd/clawd.mjs',
        '--stdio',
      ],
      env: {
        CODEX_CLAW_ASSETS_PATH: '/app/resources',
      },
    });
  });

  it('uses the packaged Windows node executable name', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: false,
      env: {},
      existsSync: (filePath) => filePath === 'C:\\app\\resources/clawd/node.exe' || filePath === 'C:\\app\\resources/clawd/clawd.mjs',
      platform: 'win32',
      resourcesPath: 'C:\\app\\resources',
    })?.command).toBe('C:\\app\\resources/clawd/node.exe');
  });

  it('returns null for packaged apps when the bundled runtime is missing', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: false,
      env: {},
      existsSync: () => false,
      resourcesPath: '/app/resources',
    })).toBeNull();
  });

  it('defaults backend mode to auto and accepts explicit bundled or existing modes', async () => {
    const { runtimeClawdBackendMode } = await import('../runtime-config');

    expect(runtimeClawdBackendMode({ env: {} })).toBe('auto');
    expect(runtimeClawdBackendMode({ env: { CODEX_CLAW_BACKEND_MODE: 'bundled' } })).toBe('bundled');
    expect(runtimeClawdBackendMode({ env: { CODEX_CLAW_BACKEND_MODE: 'existing' } })).toBe('existing');
    expect(runtimeClawdBackendMode({ env: { CODEX_CLAW_BACKEND_MODE: 'nope' } })).toBe('auto');
  });

  it('resolves the local clawd socket path from CODEX_CLAW_HOME or an explicit socket override', async () => {
    const { runtimeClawdSocketPath } = await import('../runtime-config');

    expect(runtimeClawdSocketPath({ env: { CODEX_CLAW_HOME: '/tmp/codex-claw' } })).toBe('/tmp/codex-claw/clawd.sock');
    expect(runtimeClawdSocketPath({ env: { CODEX_CLAW_BACKEND_SOCKET: '/tmp/custom.sock' } })).toBe('/tmp/custom.sock');
  });
});
