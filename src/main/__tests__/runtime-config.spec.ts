import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('runtime config', () => {
  it('reads the GitHub OAuth client ID from the live environment first', async () => {
    vi.stubGlobal('__CODEX_CLAW_GITHUB_CLIENT_ID__', 'packaged-client-id');
    vi.stubEnv('CODEX_CLAW_GITHUB_CLIENT_ID', ' env-client-id ');

    const { runtimeGitHubOAuthClientId } = await import('../runtime-config');

    expect(runtimeGitHubOAuthClientId()).toBe('env-client-id');
  });

  it('falls back to the GitHub OAuth client ID baked into the packaged main bundle', async () => {
    vi.stubGlobal('__CODEX_CLAW_GITHUB_CLIENT_ID__', ' packaged-client-id ');

    const { runtimeGitHubOAuthClientId } = await import('../runtime-config');

    expect(runtimeGitHubOAuthClientId()).toBe('packaged-client-id');
  });
});
