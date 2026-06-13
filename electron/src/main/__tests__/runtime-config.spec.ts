import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('runtime config', () => {
  it('returns null when no backend command is configured', async () => {
    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand()).toBeNull();
  });

  it('reads the backend command and comma-separated args from the environment', async () => {
    vi.stubEnv('CODEX_CLAW_BACKEND_COMMAND', ' node ');
    vi.stubEnv('CODEX_CLAW_BACKEND_ARGS', ' dist/clawd.mjs, --stdio ');

    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand()).toStrictEqual({
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

    expect(runtimeClawdCommand()).toStrictEqual({
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
});
