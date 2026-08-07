import { describe, expect, it } from 'vitest';
import { electronClawHostCapabilities, webClawHostCapabilities } from '../client';

describe('Claw client host capabilities', () => {
  it('describes the native Electron host', () => {
    expect(electronClawHostCapabilities).toStrictEqual({
      appLifecycle: true,
      appUpdates: true,
      daemonManagement: true,
      dockBadge: true,
      embeddedBrowser: true,
      nativeFileDialogs: true,
      openInApplications: true,
      systemPermissions: true,
    });
  });

  it('keeps the browser host free of desktop-only authority', () => {
    expect(webClawHostCapabilities).toStrictEqual({
      appLifecycle: false,
      appUpdates: false,
      daemonManagement: false,
      dockBadge: false,
      embeddedBrowser: false,
      nativeFileDialogs: false,
      openInApplications: false,
      systemPermissions: false,
    });
  });
});
