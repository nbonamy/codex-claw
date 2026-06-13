import { afterEach, describe, expect, it, vi } from 'vitest';

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
    });
  });

  it('defaults backend args to stdio mode', async () => {
    vi.stubEnv('CODEX_CLAW_BACKEND_COMMAND', 'clawd');

    const { runtimeClawdCommand } = await import('../runtime-config');

    expect(runtimeClawdCommand()).toStrictEqual({
      command: 'clawd',
      args: ['--stdio'],
    });
  });
});
