import type { CodexClawApi } from './contracts';

export type ClawClientPlatform = 'electron' | 'web';

export type ClawHostCapabilities = {
  appLifecycle: boolean;
  appUpdates: boolean;
  daemonManagement: boolean;
  dockBadge: boolean;
  embeddedBrowser: boolean;
  nativeFileDialogs: boolean;
  openInApplications: boolean;
  systemPermissions: boolean;
};

export type ClawClient = {
  api: CodexClawApi;
  capabilities: ClawHostCapabilities;
  platform: ClawClientPlatform;
};

export const electronClawHostCapabilities: Readonly<ClawHostCapabilities> = Object.freeze({
  appLifecycle: true,
  appUpdates: true,
  daemonManagement: true,
  dockBadge: true,
  embeddedBrowser: true,
  nativeFileDialogs: true,
  openInApplications: true,
  systemPermissions: true,
});

export const webClawHostCapabilities: Readonly<ClawHostCapabilities> = Object.freeze({
  appLifecycle: false,
  appUpdates: false,
  daemonManagement: false,
  dockBadge: false,
  embeddedBrowser: false,
  nativeFileDialogs: false,
  openInApplications: false,
  systemPermissions: false,
});
