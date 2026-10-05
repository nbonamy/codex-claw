import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  DesktopAutoUpdateService,
  resolveDesktopUpdateFeedUrl,
} from '../auto-update';

class AutoUpdaterMock extends EventEmitter {
  checkForUpdates = vi.fn();
  quitAndInstall = vi.fn();
  setFeedURL = vi.fn();
}

function createService(options: {
  app?: { getVersion: () => string; isPackaged: boolean };
  platform?: NodeJS.Platform;
  updater?: AutoUpdaterMock;
} = {}) {
  const updater = options.updater ?? new AutoUpdaterMock();
  const setIntervalFn = vi.fn() as unknown as typeof setInterval;
  const statuses: Array<{ state: string; error?: string; version?: string }> = [];
  const service = new DesktopAutoUpdateService({
    app: options.app ?? { getVersion: () => '0.3.0', isPackaged: true },
    arch: 'arm64',
    autoUpdater: updater,
    logger: { error: vi.fn(), log: vi.fn() },
    onStatusChanged: (status) => statuses.push(status),
    platform: options.platform ?? 'darwin',
    setIntervalFn,
    updateBaseUrl: 'https://updates.example.test/releases',
  });

  return { service, statuses, updater, setIntervalFn };
}

describe('desktop auto-update', () => {
  it('resolves the platform and architecture feed URL', () => {
    expect(resolveDesktopUpdateFeedUrl(
      'https://updates.example.test/releases/',
      'darwin',
      'arm64',
    )).toBe('https://updates.example.test/releases/darwin/arm64/RELEASES.json');
  });

  it('rejects non-https feeds', () => {
    expect(() => resolveDesktopUpdateFeedUrl('http://localhost:3000/releases')).toThrow(
      'Desktop update URL must use https',
    );
  });

  it('disables updates in development and on unsupported platforms', () => {
    const development = createService({ app: { getVersion: () => '0.3.0', isPackaged: false } });
    development.service.start();
    expect(development.statuses).toStrictEqual([{ state: 'disabled' }]);
    expect(development.updater.checkForUpdates).not.toHaveBeenCalled();

    const windows = createService({ platform: 'win32' });
    windows.service.start();
    expect(windows.statuses).toStrictEqual([{ state: 'disabled' }]);
    expect(windows.updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('configures the packaged feed and reports updater phases', () => {
    const { service, statuses, updater, setIntervalFn } = createService();
    service.start();

    expect(updater.setFeedURL).toHaveBeenCalledWith({
      serverType: 'json',
      url: 'https://updates.example.test/releases/darwin/arm64/RELEASES.json',
    });
    expect(updater.checkForUpdates).toHaveBeenCalledOnce();
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000);

    updater.emit('checking-for-update');
    updater.emit('update-available');
    updater.emit('update-downloaded', {}, '', '0.4.0');
    expect(statuses.at(-3)).toStrictEqual({ state: 'checking' });
    expect(statuses.at(-2)).toStrictEqual({ state: 'downloading' });
    expect(statuses.at(-1)).toStrictEqual({ state: 'downloaded', version: '0.4.0' });
  });

  it('reports synchronous check failures as an error status', () => {
    const { service, statuses, updater } = createService();
    updater.checkForUpdates.mockImplementation(() => {
      throw new Error('network unavailable');
    });

    service.start();

    expect(statuses.at(-1)).toStrictEqual({ state: 'error', error: 'network unavailable' });
  });

  it('installs only after an update is downloaded', async () => {
    const { service, updater } = createService();
    service.start();
    service.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();

    updater.emit('update-downloaded', {}, '', '0.4.0');
    service.install();
    await new Promise((resolve) => setImmediate(resolve));
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
  });
});
