import { describe, expect, it, vi } from 'vitest';
import { createDesktopRequestHandlers } from '../desktop-request-handlers';
import { MemoryWorkIntegrationTokenStore } from '../work-integrations/token-store';

vi.mock('electron', () => ({
  safeStorage: {
    decryptString: vi.fn(),
    encryptString: vi.fn(),
    isEncryptionAvailable: vi.fn(() => true),
  },
  shell: {
    openExternal: vi.fn(),
  },
}));

describe('createDesktopRequestHandlers', () => {
  it('opens external URLs through the desktop port', async () => {
    const openExternal = vi.fn().mockResolvedValue(true);
    const handlers = createDesktopRequestHandlers({
      openExternal,
      tokenStore: new MemoryWorkIntegrationTokenStore(),
    });

    await expect(handlers['desktop/openExternal']?.({ url: 'https://example.com' })).resolves.toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('stores work integration tokens through the desktop token store', async () => {
    const tokenStore = new MemoryWorkIntegrationTokenStore();
    const handlers = createDesktopRequestHandlers({
      openExternal: vi.fn(),
      tokenStore,
    });
    const token = {
      provider: 'github' as const,
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      scope: 'repo',
      accountLabel: 'nbonamy',
      connectedAt: '2026-06-13T00:00:00.000Z',
    };

    await expect(handlers['desktop/workIntegrationToken/canStore']?.({})).resolves.toBe(true);
    await expect(handlers['desktop/workIntegrationToken/set']?.({ token })).resolves.toBe(true);
    await expect(handlers['desktop/workIntegrationToken/get']?.({ provider: 'github' })).resolves.toStrictEqual(token);
    await expect(handlers['desktop/workIntegrationToken/delete']?.({ provider: 'github' })).resolves.toBe(true);
    await expect(handlers['desktop/workIntegrationToken/get']?.({ provider: 'github' })).resolves.toBeNull();
  });

  it('rejects unsupported providers before touching the token store', async () => {
    const handlers = createDesktopRequestHandlers({
      openExternal: vi.fn(),
      tokenStore: new MemoryWorkIntegrationTokenStore(),
    });

    await expect(handlers['desktop/workIntegrationToken/get']?.({ provider: 'jira' })).rejects.toThrow('Unsupported work provider: jira');
  });
});
