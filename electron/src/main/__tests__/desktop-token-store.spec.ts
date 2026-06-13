import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { safeStorage } from 'electron';
import { SafeStorageDesktopTokenStore } from '../desktop-token-store';

vi.mock('electron', () => ({
  safeStorage: {
    decryptString: vi.fn((buffer: Buffer) => buffer.toString('utf8').split('').reverse().join('')),
    encryptString: vi.fn((value: string) => Buffer.from(value.split('').reverse().join(''), 'utf8')),
    isEncryptionAvailable: vi.fn(() => true),
  },
}));

const mockedSafeStorage = vi.mocked(safeStorage);

describe('SafeStorageDesktopTokenStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-token-store-'));
    mockedSafeStorage.decryptString.mockClear();
    mockedSafeStorage.encryptString.mockClear();
    mockedSafeStorage.isEncryptionAvailable.mockReturnValue(true);
  });

  afterEach(async () => {
    await rm(tmpDir, { force: true, recursive: true });
  });

  it('persists access tokens encrypted outside the app snapshot state', async () => {
    const filePath = path.join(tmpDir, 'work-integration-tokens.json');
    const store = new SafeStorageDesktopTokenStore(filePath);

    await store.set({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      scope: 'repo read:user',
      accountLabel: 'nbonamy',
      connectedAt: '2026-06-11T12:00:00.000Z',
    });

    const rawFile = await readFile(filePath, 'utf8');
    expect(rawFile).toContain('encryptedAccessToken');
    expect(rawFile).not.toContain('gho_secret');
    expect(rawFile).not.toContain('accessToken');
    await expect(store.get('github')).resolves.toStrictEqual({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      scope: 'repo read:user',
      accountLabel: 'nbonamy',
      connectedAt: '2026-06-11T12:00:00.000Z',
    });
  });

  it('refuses to store tokens when Electron encryption is unavailable', async () => {
    mockedSafeStorage.isEncryptionAvailable.mockReturnValue(false);
    const store = new SafeStorageDesktopTokenStore(path.join(tmpDir, 'work-integration-tokens.json'));

    await expect(store.set({
      provider: 'github',
      accessToken: 'gho_secret',
      tokenType: 'bearer',
      connectedAt: '2026-06-11T12:00:00.000Z',
    })).rejects.toThrow('Encrypted token storage is not available on this device.');
    await expect(store.get('github')).resolves.toBeNull();
  });
});
