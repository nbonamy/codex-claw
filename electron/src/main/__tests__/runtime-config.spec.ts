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
    vi.stubEnv('CODEX_CLAW_BACKEND_COMMAND', ' node ');
    vi.stubEnv('CODEX_CLAW_BACKEND_ARGS', ' dist/clawd.mjs, --stdio ');

    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({ cwd: process.cwd() })).toStrictEqual({
      command: 'node',
      args: ['dist/clawd.mjs', '--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
      },
    });
  });

  it('defaults backend args to stdio mode', async () => {
    vi.stubEnv('CODEX_CLAW_BACKEND_COMMAND', 'clawd');

    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({ cwd: process.cwd() })).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
      env: {
        CODEX_CLAW_ASSETS_PATH: path.resolve(process.cwd(), 'assets'),
      },
    });
  });

  it('forwards an explicitly configured assets path to clawd', async () => {
    vi.stubEnv('CODEX_CLAW_BACKEND_COMMAND', 'clawd');
    vi.stubEnv('CODEX_CLAW_ASSETS_PATH', '/app/resources');

    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand()).toStrictEqual({
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
      existsSync: (filePath) => filePath === '/app/resources/clawd/node' || filePath === '/app/resources/clawd/clawd.mjs',
      resourcesPath: '/app/resources',
      userDataPath: '/Users/nbonamy/Library/Application Support/Codex Claw',
    })).toStrictEqual({
      command: '/app/resources/clawd/node',
      args: [
        '/app/resources/clawd/clawd.mjs',
        '--stdio',
        '--state-dir',
        '/Users/nbonamy/Library/Application Support/Codex Claw',
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
      existsSync: (filePath) => filePath === 'C:\\app\\resources/clawd/node.exe' || filePath === 'C:\\app\\resources/clawd/clawd.mjs',
      platform: 'win32',
      resourcesPath: 'C:\\app\\resources',
      userDataPath: 'C:\\Users\\Nicolas\\AppData\\Roaming\\Codex Claw',
    })?.command).toBe('C:\\app\\resources/clawd/node.exe');
  });

  it('returns null for packaged apps when the bundled runtime is missing', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand({
      defaultApp: false,
      existsSync: () => false,
      resourcesPath: '/app/resources',
    })).toBeNull();
  });
});
