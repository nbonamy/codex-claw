import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { homedir } from 'node:os';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('runtime config', () => {
  it('returns null when no backend command is configured', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: true,
      env: {},
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
        CODEX_CLAW_HOME: path.join(homedir(), '.codex-claw'),
        HOME: homedir(),
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
        CODEX_CLAW_HOME: path.join(homedir(), '.codex-claw'),
        HOME: homedir(),
      },
    });
  });

  it('forwards public OAuth configuration when Electron starts clawd with it in its environment', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      cwd: process.cwd(),
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'clawd',
        CODEX_CLAW_GITHUB_CLIENT_ID: ' github-client-id ',
        CODEX_CLAW_LINEAR_CLIENT_ID: ' linear-client-id ',
        CODEX_CLAW_LINEAR_CALLBACK_URI: ' http://127.0.0.1:45678/oauth/linear/callback ',
      },
    })).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
        CODEX_CLAW_HOME: path.join(homedir(), '.codex-claw'),
        CODEX_CLAW_GITHUB_CLIENT_ID: 'github-client-id',
        CODEX_CLAW_LINEAR_CLIENT_ID: 'linear-client-id',
        CODEX_CLAW_LINEAR_CALLBACK_URI: 'http://127.0.0.1:45678/oauth/linear/callback',
        HOME: homedir(),
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
        CODEX_CLAW_HOME: path.join(homedir(), '.codex-claw'),
        HOME: homedir(),
      },
    });
  });

  it('forwards an explicitly configured bundled Codex path to local clawd', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'clawd',
        CODEX_CLAW_BUNDLED_CODEX_PATH: '/app/resources/codex/codex',
      },
    })).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
        CODEX_CLAW_BUNDLED_CODEX_PATH: '/app/resources/codex/codex',
        CODEX_CLAW_HOME: path.join(homedir(), '.codex-claw'),
        HOME: homedir(),
      },
    });
  });

  it('resolves the packaged clawd runtime from resources when no env command is configured', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: false,
      env: {
        PATH: '/usr/bin:/Users/nicolas/.nvm/versions/node/v22.19.0/bin',
      },
      execFileSync: vi.fn(() => {
        throw new Error('login shell unavailable');
      }),
      existsSync: (filePath) => filePath === '/app/resources/clawd/clawd.mjs' ||
        filePath === '/app/resources/codex/codex' ||
        filePath === '/Users/nicolas/.nvm/versions/node/v22.19.0/bin/node',
      homedir: () => '/Users/nicolas',
      resourcesPath: '/app/resources',
    })).toStrictEqual({
      command: '/Users/nicolas/.nvm/versions/node/v22.19.0/bin/node',
      args: [
        '/app/resources/clawd/clawd.mjs',
        '--stdio',
      ],
      env: {
        CODEX_CLAW_ASSETS_PATH: '/app/resources',
        CODEX_CLAW_BUNDLED_CODEX_PATH: '/app/resources/codex/codex',
        CODEX_CLAW_HOME: '/Users/nicolas/.codex-claw',
        HOME: '/Users/nicolas',
        PATH: '/usr/bin:/Users/nicolas/.nvm/versions/node/v22.19.0/bin',
      },
    });
  });

  it('converts the runtime command to serve mode for daemon launches', async () => {
    const { runtimeClawdServeCommand } = await import('../runtime-config');

    expect(runtimeClawdServeCommand({
      env: {
        CODEX_CLAW_BACKEND_COMMAND: 'node',
        CODEX_CLAW_BACKEND_ARGS: '/app/clawd.mjs,--stdio',
        CODEX_CLAW_HOME: '/Users/nicolas/.codex-claw',
      },
    })).toStrictEqual({
      command: 'node',
      args: ['/app/clawd.mjs', 'serve'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
        CODEX_CLAW_HOME: '/Users/nicolas/.codex-claw',
        HOME: homedir(),
      },
    });
  });

  it('returns null for packaged apps when node cannot be discovered', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: false,
      env: {
        PATH: '/usr/bin',
      },
      execFileSync: vi.fn(() => {
        throw new Error('login shell unavailable');
      }),
      existsSync: (filePath) => filePath === '/app/resources/clawd/clawd.mjs',
      resourcesPath: '/app/resources',
    })).toBeNull();
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
