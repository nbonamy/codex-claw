import type { WorkProviderKind } from './contracts';

export type WorkProviderToken = {
  provider: WorkProviderKind;
  accessToken: string;
  tokenType: string;
  scope?: string;
  accountLabel?: string;
  connectedAt: string;
};

export interface WorkIntegrationTokenStore {
  canStoreTokens(): boolean | Promise<boolean>;
  delete(provider: WorkProviderKind): Promise<void>;
  get(provider: WorkProviderKind): Promise<WorkProviderToken | null>;
  set(token: WorkProviderToken): Promise<void>;
}
