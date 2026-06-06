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
    expect(logger.log).toHaveBeenCalledWith('IDENTIFY_DARWIN_CODE not set, skipping macOS helper signing in afterCopy');
  });

  it('signs the Apple speech helper from the extraResource location', () => {
    const execFileSync = vi.fn();

    signDarwinBinaries('/build/Codex Claw.app/Contents/Resources/app', 'arm64', {
      env: {
        IDENTIFY_DARWIN_CODE: 'Developer ID Application: Codex Claw',
      },
      execFileSync,
      existsSync: () => true,
      logger: {
        log: vi.fn(),
        warn: vi.fn(),
      },
    });

    expect(execFileSync).toHaveBeenCalledWith('codesign', [
      '--deep',
      '--force',
      '--verbose',
      '--sign',
      'Developer ID Application: Codex Claw',
      '/build/Codex Claw.app/Contents/Resources/assets/apple-speechanalyzer-cli',
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
      'Apple speech helper not found for signing: /build/Codex Claw.app/Contents/Resources/assets/apple-speechanalyzer-cli',
    );
  });
});
