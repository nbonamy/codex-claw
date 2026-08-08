import { describe, expect, it } from 'vitest';
import { desktopClawHostCapabilities, webClawHostCapabilities } from '../client';

describe('Claw client host capabilities', () => {
  it('describes the native desktop host', () => {
    expect(desktopClawHostCapabilities).toStrictEqual({
      appLifecycle: true,
      appshots: true,
      appUpdates: true,
      computerUse: true,
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
      appshots: false,
      appUpdates: false,
      computerUse: false,
      daemonManagement: false,
      dockBadge: false,
      embeddedBrowser: false,
      nativeFileDialogs: false,
      openInApplications: false,
      systemPermissions: false,
    });
  });
});
