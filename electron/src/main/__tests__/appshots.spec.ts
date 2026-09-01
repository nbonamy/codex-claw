import { describe, expect, it, vi } from 'vitest';
import { captureAppshot } from '../appshots';
import type { ComputerUseOptions } from '../computer-use-tools';

const helperOptions: ComputerUseOptions = {
  appPath: '/Applications/Codex Claw.app',
  isPackaged: true,
  platform: 'darwin',
  resourcesPath: '/Applications/Codex Claw.app/Contents/Resources',
};

describe('captureAppshot', () => {
  it('does not load native automation when Appshots are unsupported', async () => {
    const loadNativeAutomation = vi.fn();

    await expect(captureAppshot({ loadNativeAutomation, platform: 'linux' })).rejects.toThrow(
      'Appshots are currently available only on macOS.',
    );
    expect(loadNativeAutomation).not.toHaveBeenCalled();
  });

  it('captures the identified frontmost app and includes accessibility text', async () => {
    const execute = vi.fn(async ({ command }: { command: string }) => command === 'screenshot'
      ? {
        ok: true as const,
        result: {
          app: { localizedName: 'Safari' },
          image: { dataBase64: 'cG5n', mimeType: 'image/png' },
          window: { title: 'Example' },
        },
      }
      : { ok: true as const, result: { text: 'Accessibility list' } });

    await expect(captureAppshot({
      computerUseOptions: helperOptions,
      execute: execute as never,
      nativeAutomation: { getForemostProcessId: () => 42 },
    })).resolves.toEqual({
      accessibilityText: 'Accessibility list',
      appName: 'Safari',
      imageDataUrl: 'data:image/png;base64,cG5n',
      windowTitle: 'Example',
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      arguments: { pid: 42, scope: 'window' },
      command: 'screenshot',
    }));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      arguments: expect.objectContaining({ pid: 42, showCursor: false }),
      command: 'get_app_state',
    }));
  });

  it('keeps the screenshot when accessibility text is unavailable', async () => {
    const execute = vi.fn(async ({ command }: { command: string }) => command === 'screenshot'
      ? { ok: true as const, result: { image: { dataBase64: 'cG5n', mimeType: 'image/png' } } }
      : { ok: false as const, error: 'Accessibility denied', errorCode: 'permission_denied' as const });

    await expect(captureAppshot({
      computerUseOptions: helperOptions,
      execute: execute as never,
      nativeAutomation: { getForemostProcessId: () => 42 },
    })).resolves.toEqual({ imageDataUrl: 'data:image/png;base64,cG5n' });
  });

  it('requests Screen Recording when capture permission is missing', async () => {
    const execute = vi.fn(async ({ command }: { command: string }) => command === 'request_screen_capture'
      ? { ok: true as const, result: {} }
      : command === 'screenshot'
        ? { ok: false as const, error: 'Screen Recording permission is missing.', errorCode: 'permission_denied' as const }
        : { ok: false as const, error: 'Accessibility denied', errorCode: 'permission_denied' as const });

    await expect(captureAppshot({
      computerUseOptions: helperOptions,
      execute: execute as never,
      nativeAutomation: { getForemostProcessId: () => 42 },
    })).rejects.toThrow('Allow Screen Recording');
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ command: 'request_screen_capture' }));
  });
});
