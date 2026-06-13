import { describe, expect, it, vi } from 'vitest';
import { createDesktopRequestHandlers } from '../desktop-request-handlers';

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
    });

    await expect(handlers['desktop/openExternal']?.({ url: 'https://example.com' })).resolves.toBe(true);
    expect(openExternal).toHaveBeenCalledWith('https://example.com');
  });
});
