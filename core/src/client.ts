import type { CodexClawApi } from './contracts';

export type ClawClientPlatform = 'custom' | 'desktop' | 'web';

export type ClawHostCapabilities = {
  appLifecycle: boolean;
  appshots: boolean;
  appUpdates: boolean;
  chromePlugin: boolean;
  codexResourceSharing: boolean;
  computerUse: boolean;
  daemonManagement: boolean;
  dockBadge: boolean;
  embeddedBrowser: boolean;
  nativeFileDialogs: boolean;
  openInApplications: boolean;
  remoteAgentConnections: boolean;
  systemPermissions: boolean;
};

export type ClawHostActions = {
  launchChatGpt?: () => void | Promise<void>;
  managePlugins?: () => void | Promise<void>;
  openExternal?: (url: string) => void | Promise<void>;
};

export type CustomClawHostActions = ClawHostActions & Required<Pick<
  ClawHostActions,
  'managePlugins' | 'openExternal'
>>;

type BuiltInClawClient = {
  api: CodexClawApi;
  platform: 'desktop' | 'web';
  actions?: never;
  capabilities?: never;
};

type CustomClawClient = {
  api: CodexClawApi;
  platform: 'custom';
  actions: CustomClawHostActions;
  capabilities: ClawHostCapabilities;
};

export type ClawClient = BuiltInClawClient | CustomClawClient;

export const desktopClawHostCapabilities: Readonly<ClawHostCapabilities> = Object.freeze({
  appLifecycle: true,
  appshots: true,
  appUpdates: true,
  chromePlugin: true,
  codexResourceSharing: true,
  computerUse: true,
  daemonManagement: true,
  dockBadge: true,
  embeddedBrowser: true,
  nativeFileDialogs: true,
  openInApplications: true,
  remoteAgentConnections: true,
  systemPermissions: true,
});

export const webClawHostCapabilities: Readonly<ClawHostCapabilities> = Object.freeze({
  appLifecycle: false,
  appshots: false,
  appUpdates: false,
  chromePlugin: true,
  codexResourceSharing: true,
  computerUse: false,
  daemonManagement: false,
  dockBadge: false,
  embeddedBrowser: false,
  nativeFileDialogs: false,
  openInApplications: false,
  remoteAgentConnections: true,
  systemPermissions: false,
});
