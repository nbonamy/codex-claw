import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCodexLaunch } from '../codex-command';
import { resolveRuntimeLaunch } from '@workspace/core/runtime-discovery';

vi.mock('@workspace/core/runtime-discovery', () => ({
  resolveRuntimeLaunch: vi.fn((command: string) => ({ command: command === 'codex' ? '/user/bin/codex' : command, env: { PATH: '/user/bin' } })),
}));

describe('resolveCodexLaunch', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it('keeps an explicit Settings executable path authoritative', () => {
    expect(resolveCodexLaunch(' /opt/homebrew/bin/codex ').command).toBe('/opt/homebrew/bin/codex');
  });

  it('uses the user PATH executable rather than a private app bundle', () => {
    vi.stubEnv('APP_BUNDLED_CODEX_PATH', '/app/resources/codex/codex');
    expect(resolveCodexLaunch('')).toStrictEqual({ command: '/user/bin/codex', env: { PATH: '/user/bin' } });
  });

  it('keeps missing PATH detection explicit instead of enabling SDK bundle discovery', () => {
    vi.mocked(resolveRuntimeLaunch).mockReturnValueOnce({ command: 'codex', env: { PATH: '/user/bin' } });
    expect(resolveCodexLaunch(undefined).command).toBe('codex');
  });
});
