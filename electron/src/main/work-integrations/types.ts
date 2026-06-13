import type { WorkItem, WorkProviderAuthorization, WorkProviderKind, WorkRepository } from '@codex-claw/shared/contracts';
import type { WorkProviderToken } from './token-store';

export type WorkProviderDeviceAuthorization = WorkProviderAuthorization & {
  deviceCode: string;
  intervalSeconds: number;
};

export type WorkProviderDeviceTokenPending = {
  status: 'pending';
  intervalSeconds?: number;
};

export type WorkProviderDeviceTokenSuccess = {
  status: 'success';
  token: Omit<WorkProviderToken, 'accountLabel' | 'connectedAt' | 'provider'>;
};

export type WorkProviderDeviceTokenError = {
  status: 'error';
  code: 'access_denied' | 'expired' | 'not_configured' | 'unavailable';
  message: string;
};

export type WorkProviderDeviceTokenResult =
  | WorkProviderDeviceTokenError
  | WorkProviderDeviceTokenPending
  | WorkProviderDeviceTokenSuccess;

export interface WorkProviderDriver {
  provider: WorkProviderKind;
  configured(): boolean;
  startAuthorization(): Promise<WorkProviderDeviceAuthorization>;
  pollAuthorization(deviceCode: string): Promise<WorkProviderDeviceTokenResult>;
  currentAccountLabel(token: WorkProviderToken): Promise<string>;
  listRepositories(token: WorkProviderToken): Promise<WorkRepository[]>;
  listItems(token: WorkProviderToken, repositoryId: string): Promise<WorkItem[]>;
}
