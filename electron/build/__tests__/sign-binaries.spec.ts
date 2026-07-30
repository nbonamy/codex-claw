import { describe, expect, it, vi } from 'vitest';
import { signDarwinBinaries } from '../sign-binaries';

describe('signDarwinBinaries', () => {
  it('skips signing when the signing identity is not configured', () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    };
    const execFileSync = vi.fn();

    signDarwinBinaries('/build/Codex Claw.app/Contents/Resources/app', 'arm64', {
      env: {},
      execFileSync,
      logger,
    });

    expect(execFileSync).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith('IDENTIFY_DARWIN_CODE not set, skipping macOS helper signing in afterCopyExtraResources');
  });

  it('signs the nested helpers from the extraResource location after resources are copied', () => {
    const execFileSync = vi.fn();

    signDarwinBinaries('/build/Codex Claw.app', 'arm64', {
      env: {
        IDENTIFY_DARWIN_CODE: 'Developer ID Application: Codex Claw',
      },
      execFileSync,
      existsSync: (filePath) => [
        '/build/Codex Claw.app/Contents/Resources/apple-speechanalyzer-cli',
        '/build/Codex Claw.app/Contents/Resources/Codex Claw Computer Use.app',
      ].includes(filePath),
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(execFileSync).toHaveBeenNthCalledWith(1, 'codesign', [
      '--force',
      '--verbose',
      '--options',
      'runtime',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/build/Codex Claw.app/Contents/Resources/apple-speechanalyzer-cli',
    ], {
      stdio: 'inherit',
    });
    expect(execFileSync).toHaveBeenNthCalledWith(2, 'codesign', [
      '--force',
      '--verbose',
      '--options',
      'runtime',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/build/Codex Claw.app/Contents/Resources/Codex Claw Computer Use.app',
    ], {
      stdio: 'inherit',
    });
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('supports the afterCopy app directory path used by older signing hooks', () => {
    const execFileSync = vi.fn();

    signDarwinBinaries('/build/Codex Claw.app/Contents/Resources/app', 'arm64', {
      env: {
        IDENTIFY_DARWIN_CODE: 'Developer ID Application: Codex Claw',
      },
      execFileSync,
      existsSync: (filePath) => [
        '/build/Codex Claw.app/Contents/Resources/apple-speechanalyzer-cli',
        '/build/Codex Claw.app/Contents/Resources/Codex Claw Computer Use.app',
      ].includes(filePath),
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(execFileSync).toHaveBeenNthCalledWith(1, 'codesign', [
      '--force',
      '--verbose',
      '--options',
      'runtime',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/build/Codex Claw.app/Contents/Resources/apple-speechanalyzer-cli',
    ], {
      stdio: 'inherit',
    });
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('supports the afterCopyExtraResources staging root before the app is renamed', () => {
    const execFileSync = vi.fn();

    signDarwinBinaries('/var/folders/electron-packager/tmp-123', 'arm64', {
      env: {
        IDENTIFY_DARWIN_CODE: 'Developer ID Application: Codex Claw',
      },
      execFileSync,
      existsSync: (filePath) => [
        '/var/folders/electron-packager/tmp-123/Electron.app/Contents/Resources/apple-speechanalyzer-cli',
        '/var/folders/electron-packager/tmp-123/Electron.app/Contents/Resources/Codex Claw Computer Use.app',
      ].includes(filePath),
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(execFileSync).toHaveBeenNthCalledWith(1, 'codesign', [
      '--force',
      '--verbose',
      '--options',
      'runtime',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/var/folders/electron-packager/tmp-123/Electron.app/Contents/Resources/apple-speechanalyzer-cli',
    ], {
      stdio: 'inherit',
    });
    expect(execFileSync).toHaveBeenCalledTimes(2);
  });

  it('fails when a required helper has not been copied yet', () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    };
    const execFileSync = vi.fn();

    expect(() => signDarwinBinaries('/build/Codex Claw.app/Contents/Resources/app', 'arm64', {
      env: {
        IDENTIFY_DARWIN_CODE: 'Developer ID Application: Codex Claw',
      },
      execFileSync,
      existsSync: () => false,
      logger,
    })).toThrow('Apple speech helper not found for signing: /build/Codex Claw.app/Contents/Resources/apple-speechanalyzer-cli');

    expect(execFileSync).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
