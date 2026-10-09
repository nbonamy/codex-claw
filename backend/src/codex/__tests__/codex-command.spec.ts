import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCodexCommand } from '../codex-command';
import { resolveRuntimeExecutable } from '@workspace/core/runtime-discovery';

vi.mock('@workspace/core/runtime-discovery', () => ({
  resolveRuntimeExecutable: vi.fn(() => '/user/bin/codex'),
}));

describe('resolveCodexCommand', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.mocked(resolveRuntimeExecutable).mockReset().mockReturnValue('/user/bin/codex'); });
  it('keeps an explicit Settings executable path authoritative', () => {
    expect(resolveCodexCommand(' /opt/homebrew/bin/codex ')).toBe('/opt/homebrew/bin/codex');
  });

  it('uses the user PATH executable rather than a private app bundle', () => {
    vi.stubEnv('APP_BUNDLED_CODEX_PATH', '/app/resources/codex/codex');
    expect(resolveCodexCommand('')).toBe('/user/bin/codex');
  });

  it('keeps missing PATH detection explicit instead of enabling SDK bundle discovery', () => {
    vi.mocked(resolveRuntimeExecutable).mockReturnValue(null);
    expect(resolveCodexCommand(undefined)).toBe('codex');
  });
});
