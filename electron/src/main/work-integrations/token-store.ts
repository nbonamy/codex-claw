import { safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { WorkProviderKind } from '@codex-claw/shared/contracts';

export type WorkProviderToken = {
  provider: WorkProviderKind;
  accessToken: string;
  tokenType: string;
  scope?: string;
  accountLabel?: string;
  connectedAt: string;
};

export interface WorkIntegrationTokenStore {
  canStoreTokens(): boolean;
  delete(provider: WorkProviderKind): Promise<void>;
  get(provider: WorkProviderKind): Promise<WorkProviderToken | null>;
  set(token: WorkProviderToken): Promise<void>;
}

type PersistedToken = Omit<WorkProviderToken, 'accessToken'> & {
  encryptedAccessToken: string;
};

type PersistedTokenFile = {
  tokens?: Partial<Record<WorkProviderKind, PersistedToken>>;
};

export class SafeStorageWorkIntegrationTokenStore implements WorkIntegrationTokenStore {
  constructor(private readonly filePath: string) {}

  canStoreTokens(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  async get(provider: WorkProviderKind): Promise<WorkProviderToken | null> {
    const file = await this.readFile();
    const token = file.tokens?.[provider];
    if (!token) {
      return null;
    }

    if (!this.canStoreTokens()) {
      return null;
    }

    return {
      provider,
      accessToken: safeStorage.decryptString(Buffer.from(token.encryptedAccessToken, 'base64')),
      tokenType: token.tokenType,
      ...(token.scope ? { scope: token.scope } : {}),
      ...(token.accountLabel ? { accountLabel: token.accountLabel } : {}),
      connectedAt: token.connectedAt,
    };
  }

  async set(token: WorkProviderToken): Promise<void> {
    if (!this.canStoreTokens()) {
      throw new Error('Encrypted token storage is not available on this device.');
    }

    const file = await this.readFile();
    file.tokens = {
      ...file.tokens,
      [token.provider]: {
        provider: token.provider,
        encryptedAccessToken: safeStorage.encryptString(token.accessToken).toString('base64'),
        tokenType: token.tokenType,
        ...(token.scope ? { scope: token.scope } : {}),
        ...(token.accountLabel ? { accountLabel: token.accountLabel } : {}),
        connectedAt: token.connectedAt,
      },
    };
    await this.writeFile(file);
  }

  async delete(provider: WorkProviderKind): Promise<void> {
    const file = await this.readFile();
    if (!file.tokens?.[provider]) {
      return;
    }

    delete file.tokens[provider];
    await this.writeFile(file);
  }

  private async readFile(): Promise<PersistedTokenFile> {
    try {
      const value = JSON.parse(await readFile(this.filePath, 'utf8')) as unknown;
      return isRecord(value) && isRecord(value.tokens) ? { tokens: value.tokens as PersistedTokenFile['tokens'] } : {};
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  private async writeFile(file: PersistedTokenFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  }
}

export class MemoryWorkIntegrationTokenStore implements WorkIntegrationTokenStore {
  private readonly tokens = new Map<WorkProviderKind, WorkProviderToken>();

  constructor(private readonly available = true) {}

  canStoreTokens(): boolean {
    return this.available;
  }

  async get(provider: WorkProviderKind): Promise<WorkProviderToken | null> {
    const token = this.tokens.get(provider);
    return token ? { ...token } : null;
  }

  async set(token: WorkProviderToken): Promise<void> {
    if (!this.available) {
      throw new Error('Encrypted token storage is not available on this device.');
    }
    this.tokens.set(token.provider, { ...token });
  }

  async delete(provider: WorkProviderKind): Promise<void> {
    this.tokens.delete(provider);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}
