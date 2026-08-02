import { describe, expect, it, vi } from 'vitest';
import { createClientRequestHandlers } from '../client-request-handlers';

const computerUseOptions = () => ({
  appPath: '/Applications/Codex Claw.app/Contents/Resources/app.asar',
  isPackaged: true,
  platform: 'darwin' as const,
  resourcesPath: '/Applications/Codex Claw.app/Contents/Resources',
});

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
      computerUseOptions,
    });

    await expect(handlers['client/external/open']?.({ url: 'https://example.com' })).resolves.toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });

  it('opens the agent-scoped in-app browser through the desktop port', async () => {
    const browserState = {
      url: 'https://example.com/',
      title: 'Example',
      canGoBack: false,
      canGoForward: false,
    };
    const browserOpen = vi.fn().mockResolvedValue(browserState);
    const handlers = createClientRequestHandlers({
      openExternal: vi.fn(),
      getSystemPermissionsStatus: vi.fn(),
      openAccessibilitySettings: vi.fn(),
      computerUseOptions,
      browserOpen,
    });

    await expect(handlers['client/browser/open']?.({
      agentId: 'agent-dina',
      browserId: 'primary',
      url: 'https://example.com',
    })).resolves.toStrictEqual(browserState);
    expect(browserOpen).toHaveBeenCalledWith('agent-dina', 'primary', 'https://example.com');
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
      computerUseOptions,
    });

    expect(await handlers['client/system/permissions/get']?.(undefined)).toStrictEqual(status);
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
      computerUseOptions,
    });

    await expect(handlers['client/system/permissions/accessibility/open']?.(undefined)).resolves.toStrictEqual(status);
    expect(openAccessibilitySettings).toHaveBeenCalledOnce();
  });
});
