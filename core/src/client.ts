import type { CodexClawApi } from './contracts';

export type ClawClientPlatform = 'desktop' | 'web';

export type ClawHostCapabilities = {
  appLifecycle: boolean;
  appshots: boolean;
  appUpdates: boolean;
  computerUse: boolean;
  daemonManagement: boolean;
  dockBadge: boolean;
  embeddedBrowser: boolean;
  nativeFileDialogs: boolean;
  openInApplications: boolean;
  systemPermissions: boolean;
};

export type ClawClient = {
  api: CodexClawApi;
  platform: ClawClientPlatform;
};

export const desktopClawHostCapabilities: Readonly<ClawHostCapabilities> = Object.freeze({
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

export const webClawHostCapabilities: Readonly<ClawHostCapabilities> = Object.freeze({
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
