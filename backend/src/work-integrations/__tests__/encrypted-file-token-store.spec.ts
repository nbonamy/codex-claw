import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EncryptedFileWorkIntegrationTokenStore } from '../encrypted-file-token-store';

describe('EncryptedFileWorkIntegrationTokenStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-backend-token-store-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  it('persists access tokens encrypted in backend state', async () => {
    const filePath = path.join(tmpDir, 'work-integration-tokens.json');
    const keyPath = path.join(tmpDir, 'work-integration-tokens.key');
    const store = new EncryptedFileWorkIntegrationTokenStore(filePath, keyPath);

    await store.set({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      scope: 'repo read:user',
      accountLabel: 'nbonamy',
      connectedAt: '2026-06-11T12:00:00.000Z',
    });

    const rawFile = await readFile(filePath, 'utf8');
    const rawKey = await readFile(keyPath, 'utf8');
    expect(rawFile).toContain('encryptedAccessToken');
    expect(rawFile).not.toContain('gho_secret');
    expect(rawFile).not.toContain('accessToken');
    expect(rawKey.trim()).not.toContain('gho_secret');
    await expect(store.get('github')).resolves.toStrictEqual({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      scope: 'repo read:user',
      accountLabel: 'nbonamy',
      connectedAt: '2026-06-11T12:00:00.000Z',
    });
  });

  it('deletes persisted provider tokens', async () => {
    const store = new EncryptedFileWorkIntegrationTokenStore(path.join(tmpDir, 'work-integration-tokens.json'));

    await store.set({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      connectedAt: '2026-06-11T12:00:00.000Z',
    });

    await store.delete('github');

    await expect(store.get('github')).resolves.toBeNull();
  });
});
