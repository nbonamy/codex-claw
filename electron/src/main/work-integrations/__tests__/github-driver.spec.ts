import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubWorkProviderDriver } from '../github-driver';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GitHubWorkProviderDriver', () => {
  it('starts device authorization with GitHub OAuth', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({
      device_code: 'device-code',
      user_code: 'ABCD-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    }));
    vi.stubGlobal('fetch', fetch);

    const driver = new GitHubWorkProviderDriver('client-id');

    await expect(driver.startAuthorization()).resolves.toMatchObject({
      provider: 'github',
      deviceCode: 'device-code',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      intervalSeconds: 5,
    });
    expect(fetch).toHaveBeenCalledWith('https://github.com/login/device/code', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('surfaces GitHub device authorization errors', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({
      error: 'device_flow_disabled',
      error_description: 'Device Flow must be explicitly enabled for this App',
    }));
    vi.stubGlobal('fetch', fetch);

    const driver = new GitHubWorkProviderDriver(() => 'client-id');

    await expect(driver.startAuthorization()).rejects.toThrow('Device Flow must be explicitly enabled for this App');
  });

  it('reads client ID from a dynamic provider', async () => {
    let clientId = '';
    const fetch = vi.fn().mockResolvedValue(jsonResponse({
      device_code: 'device-code',
      user_code: 'ABCD-1234',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    }));
    vi.stubGlobal('fetch', fetch);
    const driver = new GitHubWorkProviderDriver(() => clientId);

    expect(driver.configured()).toBe(false);

    clientId = 'client-id';
    await driver.startAuthorization();

    const body = fetch.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect((body as URLSearchParams).get('client_id')).toBe('client-id');
  });

  it('normalizes repositories and issue items from GitHub responses', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{
        full_name: 'nbonamy/codex-claw',
        html_url: 'https://github.com/nbonamy/codex-claw',
        private: true,
        updated_at: '2026-06-09T12:00:00.000Z',
      }]))
      .mockResolvedValueOnce(jsonResponse([{
        number: 12,
        title: 'Fix cockpit drag target',
        html_url: 'https://github.com/nbonamy/codex-claw/issues/12',
        state: 'open',
        body: 'Make issue assignment feel obvious.',
        user: { login: 'nbonamy' },
        assignees: [{ login: 'nbonamy' }, { login: 'dina' }],
        labels: [{ name: 'bug', color: 'ff0000' }],
        created_at: '2026-06-09T12:00:00.000Z',
        updated_at: '2026-06-09T12:30:00.000Z',
      }, {
        number: 13,
        title: 'This is a pull request',
        html_url: 'https://github.com/nbonamy/codex-claw/pull/13',
        pull_request: {},
        created_at: '2026-06-09T12:00:00.000Z',
        updated_at: '2026-06-09T12:30:00.000Z',
      }]));
    vi.stubGlobal('fetch', fetch);

    const driver = new GitHubWorkProviderDriver('client-id');
    const token = {
      provider: 'github' as const,
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      connectedAt: '2026-06-09T12:00:00.000Z',
    };

    await expect(driver.listRepositories(token)).resolves.toStrictEqual([{
      provider: 'github',
      id: 'nbonamy/codex-claw',
      owner: 'nbonamy',
      name: 'codex-claw',
      fullName: 'nbonamy/codex-claw',
      url: 'https://github.com/nbonamy/codex-claw',
      isPrivate: true,
      updatedAt: '2026-06-09T12:00:00.000Z',
    }]);
    await expect(driver.listItems(token, 'nbonamy/codex-claw')).resolves.toStrictEqual([{
      provider: 'github',
      id: 'nbonamy/codex-claw#12',
      repositoryId: 'nbonamy/codex-claw',
      repositoryFullName: 'nbonamy/codex-claw',
      number: 12,
      title: 'Fix cockpit drag target',
      url: 'https://github.com/nbonamy/codex-claw/issues/12',
      state: 'open',
      authorName: 'nbonamy',
      assignees: ['nbonamy', 'dina'],
      body: 'Make issue assignment feel obvious.',
      labels: [{ name: 'bug', color: 'ff0000' }],
      createdAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:30:00.000Z',
    }]);
  });
});

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(value),
  } as unknown as Response;
}
