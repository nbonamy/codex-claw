import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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
    { platform: 'win32', arch: 'x64' },
    { platform: 'win32', arch: 'arm64' },
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

  it.each(['x64', 'arm64'])('accepts Windows %s targets and validates PE executable headers', (arch) => {
    const target = selectCodexReleaseTarget(releaseConfig, 'win32', arch);
    const directory = mkdtempSync(path.join(os.tmpdir(), 'codex-pe-'));
    const executable = path.join(directory, 'codex.exe');
    try {
      const bytes = Buffer.alloc(134);
      bytes.write('MZ');
      bytes.writeUInt32LE(128, 60);
      bytes.write('PE\0\0', 128);
      bytes.writeUInt16LE(arch === 'x64' ? 0x8664 : 0xaa64, 132);
      writeFileSync(executable, bytes);
      expect(hasExpectedExecutableArchitecture(executable, target)).toBe(true);
      expect(hasExpectedExecutableArchitecture(executable, { platform: 'win32', arch: arch === 'x64' ? 'arm64' : 'x64' })).toBe(false);
      writeFileSync(executable, bytes.subarray(0, 64));
      expect(hasExpectedExecutableArchitecture(executable, target)).toBe(false);
      bytes.write('XX', 128);
      writeFileSync(executable, bytes);
      expect(hasExpectedExecutableArchitecture(executable, target)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
