import type { WorkProviderKind } from '@codex-claw/shared/contracts';
import type { WorkIntegrationTokenStore, WorkProviderToken } from '@codex-claw/shared/work-integration-tokens';

export type DesktopRpcPort = {
  request<Result>(method: string, params?: unknown): Promise<Result>;
};

export class DesktopWorkIntegrationTokenStore implements WorkIntegrationTokenStore {
  constructor(private readonly desktop: DesktopRpcPort) {}

  canStoreTokens(): Promise<boolean> {
    return this.desktop.request<boolean>('desktop/workIntegrationToken/canStore');
  }

  delete(provider: WorkProviderKind): Promise<void> {
    return this.desktop.request<void>('desktop/workIntegrationToken/delete', { provider });
  }

  get(provider: WorkProviderKind): Promise<WorkProviderToken | null> {
    return this.desktop.request<WorkProviderToken | null>('desktop/workIntegrationToken/get', { provider });
  }

  async set(token: WorkProviderToken): Promise<void> {
    await this.desktop.request('desktop/workIntegrationToken/set', { token });
  }
}
