import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { WorkProviderKind } from '@codex-claw/shared/contracts';
import type { WorkIntegrationTokenStore, WorkProviderToken } from '@codex-claw/shared/work-integration-tokens';

type EncryptedValue = {
  algorithm: 'aes-256-gcm';
  iv: string;
  ciphertext: string;
  authTag: string;
};

type PersistedToken = Omit<WorkProviderToken, 'accessToken'> & {
  encryptedAccessToken: EncryptedValue;
};

type PersistedTokenFile = {
  tokens?: Partial<Record<WorkProviderKind, PersistedToken>>;
};

export class EncryptedFileWorkIntegrationTokenStore implements WorkIntegrationTokenStore {
  constructor(
    private readonly filePath: string,
    private readonly keyPath = path.join(path.dirname(filePath), 'work-integration-tokens.key'),
  ) {}

  canStoreTokens(): boolean {
    return true;
  }

  async get(provider: WorkProviderKind): Promise<WorkProviderToken | null> {
    const file = await this.readTokenFile();
    const token = file.tokens?.[provider];
    if (!token) {
      return null;
    }

    return {
      provider,
      accessToken: decryptTokenValue(await this.readOrCreateKey(), token.encryptedAccessToken),
      tokenType: token.tokenType,
      ...(token.scope ? { scope: token.scope } : {}),
      ...(token.accountLabel ? { accountLabel: token.accountLabel } : {}),
      connectedAt: token.connectedAt,
    };
  }

  async set(token: WorkProviderToken): Promise<void> {
    const file = await this.readTokenFile();
    file.tokens = {
      ...file.tokens,
      [token.provider]: {
        provider: token.provider,
        encryptedAccessToken: encryptTokenValue(await this.readOrCreateKey(), token.accessToken),
        tokenType: token.tokenType,
        ...(token.scope ? { scope: token.scope } : {}),
        ...(token.accountLabel ? { accountLabel: token.accountLabel } : {}),
        connectedAt: token.connectedAt,
      },
    };
    await this.writeTokenFile(file);
  }

  async delete(provider: WorkProviderKind): Promise<void> {
    const file = await this.readTokenFile();
    if (!file.tokens?.[provider]) {
      return;
    }

    delete file.tokens[provider];
    await this.writeTokenFile(file);
  }

  private async readTokenFile(): Promise<PersistedTokenFile> {
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

  private async writeTokenFile(file: PersistedTokenFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }

  private async readOrCreateKey(): Promise<Buffer> {
    try {
      const key = Buffer.from((await readFile(this.keyPath, 'utf8')).trim(), 'base64');
      if (key.byteLength !== 32) {
        throw new Error('Invalid work integration token key.');
      }
      return key;
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        throw error;
      }
    }

    const key = randomBytes(32);
    await mkdir(path.dirname(this.keyPath), { recursive: true });
    await writeFile(this.keyPath, `${key.toString('base64')}\n`, { encoding: 'utf8', mode: 0o600 });
    return key;
  }
}

function encryptTokenValue(key: Buffer, value: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

function decryptTokenValue(key: Buffer, value: EncryptedValue): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === 'object' && 'code' in error);
}
