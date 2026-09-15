export type SshHostCandidate = {
  host: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  configPath?: string;
  line?: number;
};

export type RemoteConnectionStatus = 'saved' | 'checking' | 'ready' | 'error';

export type RemoteConnectionTransport = {
  type: 'ssh-stdio';
  command: 'ssh';
  args: string[];
};

export type RemoteConnection = {
  id: string;
  kind: 'ssh';
  name: string;
  host: string;
  hostName?: string;
  user?: string;
  port?: number;
  identityFile?: string;
  status: RemoteConnectionStatus;
  clawdVersion?: string;
  codexVersion?: string;
  detail?: string;
  sourceFolderPath?: string;
  transport?: RemoteConnectionTransport;
  installedAt?: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RemoteConnectionsState = {
  connections: RemoteConnection[];
};

export type DevicePairingStatus = {
  status: 'disabled' | 'connecting' | 'connected' | 'errored';
  serverName?: string;
  installationId?: string;
  environmentId?: string | null;
  allowRemoteControl?: boolean | null;
  detail?: string;
};

export type DevicePairingSession = {
  pairingCode: string;
  manualPairingCode?: string | null;
  environmentId: string;
  expiresAt: string;
};

export type PairedDevice = {
  clientId: string;
  displayName?: string | null;
  deviceType?: string | null;
  platform?: string | null;
  osVersion?: string | null;
  deviceModel?: string | null;
  appVersion?: string | null;
  lastSeenAt?: string | null;
};

export type AddSshConnectionInput = SshHostCandidate & {
  name?: string;
};

export type UpdateRemoteConnectionInput = {
  sourceFolderPath?: string;
};
