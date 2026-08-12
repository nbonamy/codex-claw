import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkProviderToken } from '@codex-claw/core/work-integration-tokens';
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

  it('captures and rotates expiring GitHub App user tokens from device flow', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
      const fetch = vi.fn()
        .mockResolvedValueOnce(jsonResponse({
          access_token: 'ghu_access_1',
          expires_in: 28_800,
          refresh_token: 'ghr_refresh_1',
          refresh_token_expires_in: 15_897_600,
          token_type: 'bearer',
          scope: '',
        }))
        .mockResolvedValueOnce(jsonResponse({
          access_token: 'ghu_access_2',
          expires_in: 28_800,
          refresh_token: 'ghr_refresh_2',
          refresh_token_expires_in: 15_897_600,
          token_type: 'bearer',
          scope: '',
        }));
      vi.stubGlobal('fetch', fetch);
      const driver = new GitHubWorkProviderDriver('client-id');

      const authorization = await driver.pollAuthorization('device-code');
      expect(authorization).toStrictEqual({
        status: 'success',
        token: {
          accessToken: 'ghu_access_1',
          expiresAt: '2026-08-01T08:00:00.000Z',
          refreshToken: 'ghr_refresh_1',
          refreshTokenExpiresAt: '2027-02-01T00:00:00.000Z',
          scope: '',
          tokenType: 'bearer',
        },
      });
      if (authorization.status !== 'success') throw new Error('Expected successful device authorization.');
      const token: WorkProviderToken = {
        provider: 'github',
        ...authorization.token,
        connectedAt: '2026-08-01T00:00:00.000Z',
      };

      await expect(driver.refreshToken(token)).resolves.toMatchObject({
        accessToken: 'ghu_access_2',
        refreshToken: 'ghr_refresh_2',
      });
      const refreshBody = fetch.mock.calls[1]?.[1]?.body;
      expect(refreshBody).toBeInstanceOf(URLSearchParams);
      expect((refreshBody as URLSearchParams).get('grant_type')).toBe('refresh_token');
      expect((refreshBody as URLSearchParams).get('refresh_token')).toBe('ghr_refresh_1');
    } finally {
      vi.useRealTimers();
    }
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
      kind: 'issue',
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
    }, {
      provider: 'github',
      id: 'nbonamy/codex-claw#13',
      kind: 'pullRequest',
      repositoryId: 'nbonamy/codex-claw',
      repositoryFullName: 'nbonamy/codex-claw',
      number: 13,
      title: 'This is a pull request',
      url: 'https://github.com/nbonamy/codex-claw/pull/13',
      state: 'open',
      labels: [],
      createdAt: '2026-06-09T12:00:00.000Z',
      updatedAt: '2026-06-09T12:30:00.000Z',
    }]);
    expect(fetch).toHaveBeenLastCalledWith(
      'https://api.github.com/repos/nbonamy/codex-claw/issues?state=open&per_page=100',
      expect.any(Object),
    );
  });

  it('filters issue and pull request results by item kind and state', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse([{
      number: 13,
      title: 'Review backlog workspace',
      html_url: 'https://github.com/nbonamy/codex-claw/pull/13',
      state: 'closed',
      pull_request: {},
      created_at: '2026-06-09T12:00:00.000Z',
      updated_at: '2026-06-09T12:30:00.000Z',
    }]));
    vi.stubGlobal('fetch', fetch);
    const driver = new GitHubWorkProviderDriver('client-id');
    const token = { provider: 'github' as const, accessToken: 'secret', tokenType: 'bearer', connectedAt: 'now' };

    await expect(driver.listItems(token, 'nbonamy/codex-claw', { kind: 'pullRequest', state: 'closed' }))
      .resolves.toEqual([expect.objectContaining({ kind: 'pullRequest', state: 'closed' })]);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/nbonamy/codex-claw/issues?state=closed&per_page=100',
      expect.any(Object),
    );
  });

  it('looks up and creates draft pull requests', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse([{ number: 7, title: 'Existing', html_url: 'https://github.com/o/r/pull/7', draft: true }]))
      .mockResolvedValueOnce(jsonResponse({ default_branch: 'main' }))
      .mockResolvedValueOnce(jsonResponse({ number: 8, title: 'New PR', html_url: 'https://github.com/o/r/pull/8', draft: true }));
    vi.stubGlobal('fetch', fetch);
    const driver = new GitHubWorkProviderDriver('client-id');
    const token = { provider: 'github' as const, accessToken: 'secret', tokenType: 'bearer', connectedAt: 'now' };

    await expect(driver.findPullRequest(token, 'o/r', 'feature')).resolves.toMatchObject({ number: 7 });
    await expect(driver.createPullRequest(token, 'o/r', { branch: 'feature', title: 'New PR', body: 'Body' })).resolves.toMatchObject({ number: 8, draft: true });
    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toStrictEqual({ title: 'New PR', body: 'Body', head: 'feature', base: 'main', draft: true });
  });

  it('reports GitHub API rate-limit resets instead of a generic 403', async () => {
    const fetch = vi.fn().mockResolvedValue(errorResponse(403, {
      message: 'API rate limit exceeded for this user.',
    }, {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': '1786490212',
    }));
    vi.stubGlobal('fetch', fetch);
    const driver = new GitHubWorkProviderDriver('client-id');
    const token = { provider: 'github' as const, accessToken: 'secret', tokenType: 'bearer', connectedAt: 'now' };

    await expect(driver.findPullRequest(token, 'o/r', 'feature')).rejects.toThrow(
      'GitHub API rate limit exceeded. Try again after 2026-08-11T23:16:52.000Z.',
    );
  });
});

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(value),
  } as unknown as Response;
}

function errorResponse(status: number, value: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    json: vi.fn().mockResolvedValue(value),
  } as unknown as Response;
}
