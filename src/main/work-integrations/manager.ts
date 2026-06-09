import type { AppSnapshot, WorkIntegrationConnection, WorkItem, WorkProviderAuthorization, WorkProviderConnectResult, WorkProviderKind, WorkRepository } from '../../shared/contracts';
import type { WorkIntegrationTokenStore, WorkProviderToken } from './token-store';
import type { WorkProviderDeviceAuthorization, WorkProviderDriver } from './types';

type WorkIntegrationManagerOptions = {
  drivers: WorkProviderDriver[];
  getSnapshot: () => AppSnapshot;
  openExternal: (url: string) => Promise<unknown>;
  saveSnapshot: () => Promise<void>;
  tokenStore: WorkIntegrationTokenStore;
};

type PendingAuthorization = WorkProviderDeviceAuthorization & {
  lastPollAt: number | null;
};

export class WorkIntegrationManager {
  private readonly drivers = new Map<WorkProviderKind, WorkProviderDriver>();
  private readonly pendingAuthorizations = new Map<WorkProviderKind, PendingAuthorization>();

  constructor(private readonly options: WorkIntegrationManagerOptions) {
    for (const driver of options.drivers) {
      this.drivers.set(driver.provider, driver);
    }
  }

  async hydrateConnections(): Promise<void> {
    let changed = false;
    for (const connection of this.snapshot().workBacklog.connections) {
      const driver = this.driver(connection.provider);
      if (!driver.configured()) {
        changed = this.setConnection({
          provider: connection.provider,
          status: 'notConfigured',
          detail: `${providerLabel(connection.provider)} OAuth is not configured.`,
        }) || changed;
        continue;
      }

      if (connection.status !== 'connected') {
        changed = this.setConnection({
          ...connection,
          status: connection.status === 'notConfigured' ? 'disconnected' : connection.status,
          detail: connection.status === 'notConfigured' ? undefined : connection.detail,
        }) || changed;
        continue;
      }

      const token = await this.options.tokenStore.get(connection.provider);
      if (!token) {
        changed = this.setConnection({
          provider: connection.provider,
          status: 'disconnected',
          detail: `${providerLabel(connection.provider)} needs to be reconnected.`,
        }) || changed;
      }
    }

    if (changed) {
      await this.options.saveSnapshot();
    }
  }

  async connect(provider: WorkProviderKind): Promise<WorkProviderConnectResult> {
    const driver = this.driver(provider);
    if (!this.options.tokenStore.canStoreTokens()) {
      this.setConnection({
        provider,
        status: 'error',
        detail: 'Encrypted token storage is not available on this device.',
      });
      await this.options.saveSnapshot();
      return { snapshot: this.snapshot() };
    }

    if (!driver.configured()) {
      this.setConnection({
        provider,
        status: 'notConfigured',
        detail: `${providerLabel(provider)} OAuth is not configured.`,
      });
      await this.options.saveSnapshot();
      return { snapshot: this.snapshot() };
    }

    const authorization = await driver.startAuthorization();
    this.pendingAuthorizations.set(provider, {
      ...authorization,
      lastPollAt: null,
    });
    this.setConnection({
      provider,
      status: 'connecting',
      detail: `Enter code ${authorization.userCode} in ${providerLabel(provider)}.`,
    });
    await this.options.saveSnapshot();
    await this.options.openExternal(authorization.verificationUri);

    return {
      snapshot: this.snapshot(),
      authorization: publicAuthorization(authorization),
    };
  }

  async completeConnection(provider: WorkProviderKind): Promise<AppSnapshot> {
    const pending = this.pendingAuthorizations.get(provider);
    if (!pending) {
      return this.snapshot();
    }

    if (Date.parse(pending.expiresAt) <= Date.now()) {
      this.pendingAuthorizations.delete(provider);
      this.setConnection({
        provider,
        status: 'error',
        detail: 'The verification code expired. Start the connection again.',
      });
      await this.options.saveSnapshot();
      return this.snapshot();
    }

    const now = Date.now();
    const waitMs = pending.lastPollAt === null ? 0 : Math.max(pending.intervalSeconds * 1000 - (now - pending.lastPollAt), 0);
    if (waitMs > 0) {
      this.setConnection({
        provider,
        status: 'connecting',
        detail: `GitHub is still waiting for authorization. Try again in ${Math.ceil(waitMs / 1000)}s.`,
      });
      await this.options.saveSnapshot();
      return this.snapshot();
    }

    pending.lastPollAt = now;
    const result = await this.driver(provider).pollAuthorization(pending.deviceCode);
    if (result.status === 'pending') {
      if (result.intervalSeconds) {
        pending.intervalSeconds = result.intervalSeconds;
      }
      this.setConnection({
        provider,
        status: 'connecting',
        detail: `${providerLabel(provider)} authorization is still pending.`,
      });
      await this.options.saveSnapshot();
      return this.snapshot();
    }

    if (result.status === 'error') {
      this.pendingAuthorizations.delete(provider);
      this.setConnection({
        provider,
        status: result.code === 'not_configured' ? 'notConfigured' : 'error',
        detail: result.message,
      });
      await this.options.saveSnapshot();
      return this.snapshot();
    }

    const token: WorkProviderToken = {
      provider,
      ...result.token,
      connectedAt: new Date().toISOString(),
    };
    const accountLabel = await this.driver(provider).currentAccountLabel(token);
    await this.options.tokenStore.set({
      ...token,
      accountLabel,
    });
    this.pendingAuthorizations.delete(provider);
    this.setConnection({
      provider,
      status: 'connected',
      accountLabel,
      connectedAt: token.connectedAt,
    });
    await this.options.saveSnapshot();

    return this.snapshot();
  }

  async disconnect(provider: WorkProviderKind): Promise<AppSnapshot> {
    this.pendingAuthorizations.delete(provider);
    await this.options.tokenStore.delete(provider);
    delete this.snapshot().workBacklog.selectedRepositoryIds[provider];
    this.setConnection({
      provider,
      status: this.driver(provider).configured() ? 'disconnected' : 'notConfigured',
    });
    await this.options.saveSnapshot();
    return this.snapshot();
  }

  async listRepositories(provider: WorkProviderKind): Promise<WorkRepository[]> {
    const token = await this.connectedToken(provider);
    return this.driver(provider).listRepositories(token);
  }

  async selectRepository(provider: WorkProviderKind, repositoryId: string | null): Promise<AppSnapshot> {
    if (repositoryId) {
      this.snapshot().workBacklog.selectedRepositoryIds[provider] = repositoryId;
    } else {
      delete this.snapshot().workBacklog.selectedRepositoryIds[provider];
    }
    await this.options.saveSnapshot();
    return this.snapshot();
  }

  async listItems(provider: WorkProviderKind, repositoryId: string): Promise<WorkItem[]> {
    const token = await this.connectedToken(provider);
    return this.driver(provider).listItems(token, repositoryId);
  }

  private async connectedToken(provider: WorkProviderKind): Promise<WorkProviderToken> {
    const token = await this.options.tokenStore.get(provider);
    if (!token) {
      this.setConnection({
        provider,
        status: this.driver(provider).configured() ? 'disconnected' : 'notConfigured',
        detail: `${providerLabel(provider)} needs to be connected.`,
      });
      await this.options.saveSnapshot();
      throw new Error(`${providerLabel(provider)} is not connected.`);
    }

    return token;
  }

  private driver(provider: WorkProviderKind): WorkProviderDriver {
    const driver = this.drivers.get(provider);
    if (!driver) {
      throw new Error(`Unsupported work provider: ${provider}`);
    }
    return driver;
  }

  private snapshot(): AppSnapshot {
    return this.options.getSnapshot();
  }

  private setConnection(connection: WorkIntegrationConnection): boolean {
    const snapshot = this.snapshot();
    const index = snapshot.workBacklog.connections.findIndex((candidate) => candidate.provider === connection.provider);
    if (index === -1) {
      snapshot.workBacklog.connections.push(connection);
      return true;
    }

    const previous = snapshot.workBacklog.connections[index];
    if (previous && JSON.stringify(previous) === JSON.stringify(connection)) {
      return false;
    }

    snapshot.workBacklog.connections[index] = connection;
    return true;
  }
}

function publicAuthorization(authorization: WorkProviderDeviceAuthorization): WorkProviderAuthorization {
  return {
    provider: authorization.provider,
    userCode: authorization.userCode,
    verificationUri: authorization.verificationUri,
    expiresAt: authorization.expiresAt,
  };
}

function providerLabel(provider: WorkProviderKind): string {
  return provider === 'github' ? 'GitHub' : provider;
}
