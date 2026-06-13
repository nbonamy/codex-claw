import { describe, expect, it, vi } from 'vitest';
import { createClientRequestHandlers } from '../client-request-handlers';

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

describe('createClientRequestHandlers', () => {
  it('opens external URLs through the desktop port', async () => {
    const openExternal = vi.fn().mockResolvedValue(true);
    const handlers = createClientRequestHandlers({
      openExternal,
      getSystemPermissionsStatus: vi.fn(),
      openAccessibilitySettings: vi.fn(),
    });

    await expect(handlers['client/openExternal']?.({ url: 'https://example.com' })).resolves.toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('checks system permissions through the desktop-native port', async () => {
    const status = {
      platform: 'darwin',
      accessibility: {
        required: true,
        trusted: false,
      },
    };
    const getSystemPermissionsStatus = vi.fn().mockReturnValue(status);
    const handlers = createClientRequestHandlers({
      openExternal: vi.fn(),
      getSystemPermissionsStatus,
      openAccessibilitySettings: vi.fn(),
    });

    expect(await handlers['client/systemPermissions/get']?.(undefined)).toStrictEqual(status);
    expect(getSystemPermissionsStatus).toHaveBeenCalledOnce();
  });

  it('opens accessibility settings through the desktop-native port', async () => {
    const status = {
      platform: 'darwin',
      accessibility: {
        required: true,
        trusted: true,
      },
    };
    const openAccessibilitySettings = vi.fn().mockResolvedValue(status);
    const handlers = createClientRequestHandlers({
      openExternal: vi.fn(),
      getSystemPermissionsStatus: vi.fn(),
      openAccessibilitySettings,
    });

    await expect(handlers['client/systemPermissions/openAccessibilitySettings']?.(undefined)).resolves.toStrictEqual(status);
    expect(openAccessibilitySettings).toHaveBeenCalledOnce();
  });
});
