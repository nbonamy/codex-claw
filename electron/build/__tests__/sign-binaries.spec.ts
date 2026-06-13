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

  it('signs the Apple speech helper from the extraResource location after resources are copied', () => {
    const execFileSync = vi.fn();

    signDarwinBinaries('/build/Codex Claw.app', 'arm64', {
      env: {
        IDENTIFY_DARWIN_CODE: 'Developer ID Application: Codex Claw',
      },
      execFileSync,
      existsSync: (filePath) => filePath === '/build/Codex Claw.app/Contents/Resources/apple-speechanalyzer-cli' ||
        filePath === '/build/Codex Claw.app/Contents/Resources/clawd/node',
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(execFileSync).toHaveBeenNthCalledWith(1, 'codesign', [
      '--deep',
      '--force',
      '--verbose',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/build/Codex Claw.app/Contents/Resources/apple-speechanalyzer-cli',
    ], {
      stdio: 'inherit',
    });
    expect(execFileSync).toHaveBeenNthCalledWith(2, 'codesign', [
      '--deep',
      '--force',
      '--verbose',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/build/Codex Claw.app/Contents/Resources/clawd/node',
    ], {
      stdio: 'inherit',
    });
  });

  it('supports the afterCopy app directory path used by older signing hooks', () => {
    const execFileSync = vi.fn();

    signDarwinBinaries('/build/Codex Claw.app/Contents/Resources/app', 'arm64', {
      env: {
        IDENTIFY_DARWIN_CODE: 'Developer ID Application: Codex Claw',
      },
      execFileSync,
      existsSync: (filePath) => filePath === '/build/Codex Claw.app/Contents/Resources/apple-speechanalyzer-cli' ||
        filePath === '/build/Codex Claw.app/Contents/Resources/clawd/node',
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(execFileSync).toHaveBeenNthCalledWith(1, 'codesign', [
      '--deep',
      '--force',
      '--verbose',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/build/Codex Claw.app/Contents/Resources/apple-speechanalyzer-cli',
    ], {
      stdio: 'inherit',
    });
    expect(execFileSync).toHaveBeenNthCalledWith(2, 'codesign', [
      '--deep',
      '--force',
      '--verbose',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/build/Codex Claw.app/Contents/Resources/clawd/node',
    ], {
      stdio: 'inherit',
    });
  });

  it('supports the afterCopyExtraResources staging root before the app is renamed', () => {
    const execFileSync = vi.fn();

    signDarwinBinaries('/var/folders/electron-packager/tmp-123', 'arm64', {
      env: {
        IDENTIFY_DARWIN_CODE: 'Developer ID Application: Codex Claw',
      },
      execFileSync,
      existsSync: (filePath) => filePath === '/var/folders/electron-packager/tmp-123/Electron.app/Contents/Resources/apple-speechanalyzer-cli' ||
        filePath === '/var/folders/electron-packager/tmp-123/Electron.app/Contents/Resources/clawd/node',
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(execFileSync).toHaveBeenNthCalledWith(1, 'codesign', [
      '--deep',
      '--force',
      '--verbose',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/var/folders/electron-packager/tmp-123/Electron.app/Contents/Resources/apple-speechanalyzer-cli',
    ], {
      stdio: 'inherit',
    });
    expect(execFileSync).toHaveBeenNthCalledWith(2, 'codesign', [
      '--deep',
      '--force',
      '--verbose',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/var/folders/electron-packager/tmp-123/Electron.app/Contents/Resources/clawd/node',
    ], {
      stdio: 'inherit',
    });
  });

  it('warns instead of failing when the helper has not been copied yet', () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
    };
    const execFileSync = vi.fn();

    signDarwinBinaries('/build/Codex Claw.app/Contents/Resources/app', 'arm64', {
      env: {
        IDENTIFY_DARWIN_CODE: 'Developer ID Application: Codex Claw',
      },
      execFileSync,
      existsSync: () => false,
      logger,
    });

    expect(execFileSync).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Apple speech helper not found for signing: /build/Codex Claw.app/Contents/Resources/apple-speechanalyzer-cli',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'clawd node runtime not found for signing: /build/Codex Claw.app/Contents/Resources/clawd/node',
    );
  });
});
