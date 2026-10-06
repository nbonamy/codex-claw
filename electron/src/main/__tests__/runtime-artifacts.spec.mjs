import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  hasExpectedExecutableArchitecture,
  selectCodexReleaseTarget,
  shouldPrepareComputerUse,
} from '../../../../scripts/runtime-artifacts.mjs';

const releaseConfig = {
  version: '0.153.4',
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
      'Bundled Codex 0.153.4 does not support linux/arm64.',
    );
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

  it('validates Windows PE architecture and rejects truncated images', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'app-pe-'));
    const executable = path.join(dir, 'codex.exe');
    try {
      const image = Buffer.alloc(256);
      image.write('MZ');
      image.writeUInt32LE(128, 60);
      image.write('PE\0\0', 128);
      image.writeUInt16LE(0x8664, 132);
      writeFileSync(executable, image);
      expect(hasExpectedExecutableArchitecture(executable, { platform: 'win32', arch: 'x64' })).toBe(true);
      expect(hasExpectedExecutableArchitecture(executable, { platform: 'win32', arch: 'arm64' })).toBe(false);
      writeFileSync(executable, image.subarray(0, 64));
      expect(hasExpectedExecutableArchitecture(executable, { platform: 'win32', arch: 'x64' })).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
