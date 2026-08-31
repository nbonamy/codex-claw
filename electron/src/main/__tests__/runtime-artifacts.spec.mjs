import { describe, expect, it, vi } from 'vitest';
import {
  hasExpectedExecutableArchitecture,
  resolveInstalledExecutable,
  selectCodexReleaseTarget,
  shouldPrepareComputerUse,
} from '../../../../scripts/runtime-artifacts.mjs';

const releaseConfig = {
  version: '0.151.0',
  targets: [
    { platform: 'darwin', arch: 'arm64' },
    { platform: 'linux', arch: 'x64' },
  ],
};

describe('runtime artifacts', () => {
  it('selects the release target for the current platform and rejects unsupported hosts', () => {
    expect(selectCodexReleaseTarget(releaseConfig, 'linux', 'x64')).toStrictEqual({
      platform: 'linux',
      arch: 'x64',
    });
    expect(() => selectCodexReleaseTarget(releaseConfig, 'linux', 'arm64')).toThrow(
      'Bundled Codex 0.151.0 does not support linux/arm64.',
    );
  });

  it('prefers the installer bin alias and falls back to the standalone release layout', () => {
    const realpathSync = vi.fn((filePath) => `/real${filePath}`);
    const aliasFs = {
      existsSync: vi.fn((filePath) => filePath === '/install/bin/codex-code-mode-host'),
      realpathSync,
    };
    expect(resolveInstalledExecutable(
      'codex-code-mode-host', '/install/bin', '/install/home', aliasFs,
    )).toBe('/real/install/bin/codex-code-mode-host');

    const standalonePath = '/install/home/packages/standalone/current/bin/codex-code-mode-host';
    const standaloneFs = {
      existsSync: vi.fn((filePath) => filePath === standalonePath),
      realpathSync,
    };
    expect(resolveInstalledExecutable(
      'codex-code-mode-host', '/install/bin', '/install/home', standaloneFs,
    )).toBe(`/real${standalonePath}`);
  });

  it('throws when the installer provides neither executable layout', () => {
    expect(() => resolveInstalledExecutable('codex', '/bin', '/home', {
      existsSync: vi.fn(() => false),
      realpathSync: vi.fn(),
    })).toThrow("OpenAI's installer did not provide codex.");
  });

  it.each([
    ['x64', 0x3e, true],
    ['arm64', 0xb7, true],
    ['x64', 0xb7, false],
  ])('validates Linux %s ELF machine headers', (arch, machine, expected) => {
    const header = Buffer.alloc(20);
    Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(header);
    header[5] = 1;
    header.writeUInt16LE(machine, 18);

    expect(hasExpectedExecutableArchitecture('/codex', { platform: 'linux', arch }, {
      readElfHeader: vi.fn(() => header),
    })).toBe(expected);
  });

  it('rejects non-ELF Linux executables', () => {
    expect(hasExpectedExecutableArchitecture('/codex', { platform: 'linux', arch: 'x64' }, {
      readElfHeader: vi.fn(() => Buffer.alloc(20)),
    })).toBe(false);
  });

  it('checks Darwin architecture and signature through injected process dependencies', () => {
    const verifyDarwinSignature = vi.fn();
    const exec = vi.fn(() => 'arm64 x86_64\n');
    expect(hasExpectedExecutableArchitecture('/codex', { platform: 'darwin', arch: 'arm64' }, {
      execFileSync: exec,
      verifyDarwinSignature,
    })).toBe(true);
    expect(exec).toHaveBeenCalledWith('lipo', ['-archs', '/codex'], { encoding: 'utf8' });
    expect(verifyDarwinSignature).toHaveBeenCalledWith('/codex');
  });

  it('prepares Computer Use only on macOS', () => {
    expect(shouldPrepareComputerUse('darwin')).toBe(true);
    expect(shouldPrepareComputerUse('linux')).toBe(false);
    expect(shouldPrepareComputerUse('win32')).toBe(false);
  });
});
