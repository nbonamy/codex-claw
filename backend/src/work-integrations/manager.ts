import type { AppSnapshot, WorkBacklogConfigurationInput, WorkIntegrationConnection, WorkItem, WorkProviderAuthorization, WorkProviderConnectResult, WorkProviderKind, WorkRepository } from '@codex-claw/shared/contracts';
import type { WorkIntegrationTokenStore, WorkProviderToken } from '@codex-claw/shared/work-integration-tokens';
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
  private readonly tokenRefreshes = new Map<WorkProviderKind, Promise<WorkProviderToken>>();

  constructor(private readonly options: WorkIntegrationManagerOptions) {
    for (const driver of options.drivers) {
      this.drivers.set(driver.provider, driver);
    }
  }

  async hydrateConnections(): Promise<void> {
    let changed = false;
    const providers = new Set<WorkProviderKind>([
      ...Array.from(this.drivers.keys()),
      ...this.snapshot().workBacklog.connections.map((connection) => connection.provider),
    ]);

    for (const provider of providers) {
      const driver = this.driver(provider);
      const connection = this.snapshot().workBacklog.connections.find((candidate) => candidate.provider === provider);
      const token = await this.options.tokenStore.get(provider);
      if (token) {
        changed = this.setConnection({
          provider,
          status: 'connected',
          ...(token.accountLabel ? { accountLabel: token.accountLabel } : {}),
          connectedAt: token.connectedAt,
        }) || changed;
        continue;
      }

      if (!driver.configured()) {
        if (connection) {
          changed = this.setConnection({
            provider,
            status: 'notConfigured',
            detail: `${providerLabel(provider)} OAuth is not configured.`,
          }) || changed;
        }
        continue;
      }

      if (!connection) {
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

      changed = this.setConnection({
        provider,
        status: 'disconnected',
        detail: `${providerLabel(provider)} needs to be reconnected.`,
      }) || changed;
    }

    if (changed) {
      await this.options.saveSnapshot();
    }
  }

  async connect(provider: WorkProviderKind): Promise<WorkProviderConnectResult> {
    const driver = this.driver(provider);
    if (!await this.options.tokenStore.canStoreTokens()) {
      this.setConnection({
        provider,
        status: 'error',
        detail: 'Token storage is not available on this device.',
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

    return {
      snapshot: this.snapshot(),
      authorization: publicAuthorization(authorization),
    };
  }

  async openAuthorization(provider: WorkProviderKind): Promise<AppSnapshot> {
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

    await this.options.openExternal(authorizationUrl(pending));
    return this.snapshot();
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
    delete this.snapshot().workBacklog.providerConfigurations[provider];
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

  async configureBacklog(input: WorkBacklogConfigurationInput): Promise<AppSnapshot> {
    if (input.provider === 'github') {
      const repositoryId = normalizedOptionalString(input.configuration.repositoryId);
      if (repositoryId) {
        const assigneeLogin = normalizedOptionalString(input.configuration.assigneeLogin);
        const tagName = normalizedOptionalString(input.configuration.tagName);
        this.snapshot().workBacklog.providerConfigurations.github = {
          repositoryId,
          ...(assigneeLogin ? { assigneeLogin } : {}),
          ...(tagName ? { tagName } : {}),
        };
      } else {
        delete this.snapshot().workBacklog.providerConfigurations.github;
      }
    } else {
      input.provider satisfies never;
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

    if (!tokenNeedsRefresh(token)) return token;

    const existingRefresh = this.tokenRefreshes.get(provider);
    if (existingRefresh) return existingRefresh;

    const driver = this.driver(provider);
    if (!driver.refreshToken || !token.refreshToken || refreshTokenExpired(token)) {
      await this.markReconnectRequired(provider);
      throw new Error(`${providerLabel(provider)} needs to be reconnected.`);
    }

    const refresh = driver.refreshToken(token)
      .then(async (refreshedToken) => {
        await this.options.tokenStore.set(refreshedToken);
        return refreshedToken;
      })
      .catch(async (error: unknown) => {
        await this.markReconnectRequired(provider);
        throw error;
      })
      .finally(() => {
        if (this.tokenRefreshes.get(provider) === refresh) {
          this.tokenRefreshes.delete(provider);
        }
      });
    this.tokenRefreshes.set(provider, refresh);
    return refresh;
  }

  private async markReconnectRequired(provider: WorkProviderKind): Promise<void> {
    this.setConnection({
      provider,
      status: 'disconnected',
      detail: `${providerLabel(provider)} authorization expired. Reconnect to continue.`,
    });
    await this.options.saveSnapshot();
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

const TOKEN_REFRESH_SKEW_MS = 60_000;

function tokenNeedsRefresh(token: WorkProviderToken): boolean {
  if (!token.expiresAt) return false;
  const expiresAt = Date.parse(token.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() + TOKEN_REFRESH_SKEW_MS;
}

function refreshTokenExpired(token: WorkProviderToken): boolean {
  if (!token.refreshTokenExpiresAt) return false;
  const expiresAt = Date.parse(token.refreshTokenExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function normalizedOptionalString(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
}

function publicAuthorization(authorization: WorkProviderDeviceAuthorization): WorkProviderAuthorization {
  return {
    provider: authorization.provider,
    userCode: authorization.userCode,
    verificationUri: authorization.verificationUri,
    expiresAt: authorization.expiresAt,
  };
}

function authorizationUrl(authorization: WorkProviderDeviceAuthorization): string {
  try {
    const url = new URL(authorization.verificationUri);
    url.searchParams.set('user_code', authorization.userCode);
    return url.toString();
  } catch {
    return authorization.verificationUri;
  }
}

function providerLabel(provider: WorkProviderKind): string {
  return provider === 'github' ? 'GitHub' : provider;
}
