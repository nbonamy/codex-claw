import { describe, expect, it, vi } from 'vitest';
import { createClientRequestHandlers } from '../client-request-handlers';

const computerUseMocks = vi.hoisted(() => ({
  getStatus: vi.fn().mockResolvedValue({
    accessibilityTrusted: true,
    screenCaptureTrusted: false,
    available: true,
    platform: 'darwin',
  }),
  requestScreenCapture: vi.fn().mockResolvedValue({
    accessibilityTrusted: true,
    screenCaptureTrusted: true,
    available: true,
    platform: 'darwin',
  }),
}));

vi.mock('../computer-use-tools', async (importOriginal) => ({
  ...await importOriginal<typeof import('../computer-use-tools')>(),
  getComputerUseStatus: computerUseMocks.getStatus,
  requestComputerUseScreenCapture: computerUseMocks.requestScreenCapture,
}));

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

  it('validates and queues a bounded provider-neutral spoken announcement', async () => {
    const queue = vi.fn().mockReturnValue({ queued: true });
    const handlers = createClientRequestHandlers({
      openExternal: vi.fn(),
      getSystemPermissionsStatus: vi.fn(),
      openAccessibilitySettings: vi.fn(),
      computerUseOptions,
      spokenAnnouncements: { queue },
    });

    expect(await handlers['client/spokenAnnouncement/queue']?.({
      agentId: 'agent-dina',
      phase: 'finish',
      text: '  Wrapped up.  ',
    })).toStrictEqual({ queued: true });
    expect(queue).toHaveBeenCalledWith({
      agentId: 'agent-dina',
      phase: 'finish',
      text: 'Wrapped up.',
    });
    await expect(async () => handlers['client/spokenAnnouncement/queue']?.({
      agentId: 'agent-dina',
      phase: 'middle',
      text: 'Nope.',
    })).rejects.toThrowError('Invalid phase.');
    await expect(async () => handlers['client/spokenAnnouncement/queue']?.({
      agentId: 'agent-dina',
      phase: 'start',
      text: 'x'.repeat(161),
    })).rejects.toThrowError('Invalid text.');
  });

  it('reports unsupported speech without failing the client request', async () => {
    const handlers = createClientRequestHandlers({
      openExternal: vi.fn(),
      getSystemPermissionsStatus: vi.fn(),
      openAccessibilitySettings: vi.fn(),
      computerUseOptions,
    });
    expect(await handlers['client/spokenAnnouncement/queue']?.({
      agentId: 'agent-dina', phase: 'start', text: 'On it.',
    })).toStrictEqual({ queued: false, reason: 'unsupported' });
  });

  it('checks system permissions through the desktop-native port', async () => {
    const status = {
      platform: 'darwin',
      accessibility: {
        required: true,
        trusted: false,
      },
      screenRecording: {
        required: false,
        trusted: true,
      },
    };
    const getSystemPermissionsStatus = vi.fn().mockReturnValue(status);
    const handlers = createClientRequestHandlers({
      openExternal: vi.fn(),
      getSystemPermissionsStatus,
      openAccessibilitySettings: vi.fn(),
      computerUseOptions,
    });

    expect(await handlers['client/system/permissions/get']?.(undefined)).toStrictEqual({
      ...status,
      screenRecording: { required: true, trusted: false },
    });
    expect(getSystemPermissionsStatus).toHaveBeenCalledOnce();
  });

  it('opens accessibility settings through the desktop-native port', async () => {
    const status = {
      platform: 'darwin',
      accessibility: {
        required: true,
        trusted: true,
      },
      screenRecording: {
        required: false,
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

    await expect(handlers['client/system/permissions/accessibility/open']?.(undefined)).resolves.toStrictEqual({
      ...status,
      screenRecording: { required: true, trusted: false },
    });
    expect(openAccessibilitySettings).toHaveBeenCalledOnce();
  });

  it('requests Screen Recording through the Computer Use helper', async () => {
    const status = {
      platform: 'darwin',
      accessibility: { required: true, trusted: true },
      screenRecording: { required: false, trusted: true },
    };
    const handlers = createClientRequestHandlers({
      openExternal: vi.fn(),
      getSystemPermissionsStatus: vi.fn(() => status),
      openAccessibilitySettings: vi.fn(),
      computerUseOptions,
    });

    await expect(handlers['client/system/permissions/screenRecording/open']?.(undefined)).resolves.toStrictEqual({
      ...status,
      screenRecording: { required: true, trusted: true },
    });
    expect(computerUseMocks.requestScreenCapture).toHaveBeenCalledOnce();
  });
});
