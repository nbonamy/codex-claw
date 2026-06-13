import { describe, expect, it } from 'vitest';
import { DesktopWorkIntegrationTokenStore } from '../desktop-work-integration-token-store';

describe('DesktopWorkIntegrationTokenStore', () => {
  it('delegates token storage to desktop RPC requests', async () => {
    const requests: { method: string; params?: unknown }[] = [];
    const store = new DesktopWorkIntegrationTokenStore({
      async request<Result>(method: string, params?: unknown): Promise<Result> {
        requests.push(params === undefined ? { method } : { method, params });
        return responseFor(method) as Result;
      },
    });

    await expect(store.canStoreTokens()).resolves.toBe(true);
    await expect(store.get('github')).resolves.toMatchObject({ accessToken: 'gho_secret' });
    await store.set({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      connectedAt: '2026-06-13T00:00:00.000Z',
    });
    await store.delete('github');

    expect(requests).toStrictEqual([
      { method: 'desktop/workIntegrationToken/canStore' },
      { method: 'desktop/workIntegrationToken/get', params: { provider: 'github' } },
      {
        method: 'desktop/workIntegrationToken/set',
        params: {
          token: {
            provider: 'github',
            accessToken: 'gho_secret',
            tokenType: 'bearer',
            connectedAt: '2026-06-13T00:00:00.000Z',
          },
        },
      },
      { method: 'desktop/workIntegrationToken/delete', params: { provider: 'github' } },
    ]);
  });
});

function responseFor(method: string): unknown {
  if (method === 'desktop/workIntegrationToken/canStore') {
    return true;
  }
  if (method === 'desktop/workIntegrationToken/get') {
    return {
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      connectedAt: '2026-06-13T00:00:00.000Z',
    };
  }
  return true;
}
