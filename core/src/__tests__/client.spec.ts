import { product } from '../product';
import { describe, expect, it } from 'vitest';
import { desktopAppHostCapabilities, webAppHostCapabilities } from '../client';

describe(`${product.name} client host capabilities`, () => {
  it('describes the native desktop host', () => {
    expect(desktopAppHostCapabilities).toStrictEqual({
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
    expect(webAppHostCapabilities).toStrictEqual({
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
