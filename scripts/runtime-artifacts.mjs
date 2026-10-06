import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export function validateCodexReleaseConfig(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid bundled Codex release configuration.');
  }
  if (!/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.-]+)?$/.test(value.version)) {
    throw new Error('Bundled Codex version must be a semantic version.');
  }
  if (!Array.isArray(value.targets) || value.targets.length === 0) {
    throw new Error('Bundled Codex release must declare at least one target.');
  }
  for (const target of value.targets) {
    if (!target || typeof target !== 'object'
      || !['darwin', 'linux', 'win32'].includes(target.platform)
      || !['arm64', 'x64'].includes(target.arch)) {
      throw new Error('Bundled Codex release contains an invalid target.');
    }
  }
}

export function selectCodexReleaseTarget(config, platform, arch) {
  validateCodexReleaseConfig(config);
  const target = config.targets.find((candidate) => (
    candidate.platform === platform && candidate.arch === arch
  ));
  if (!target) {
    throw new Error(`Bundled Codex ${config.version} does not support ${platform}/${arch}.`);
  }
  return target;
}

export function hasExpectedExecutableArchitecture(executablePath, target, dependencies = {}) {
  if (target.platform === 'win32') {
    const descriptor = fs.openSync(executablePath, 'r');
    try {
      const dosHeader = Buffer.alloc(64);
      if (fs.readSync(descriptor, dosHeader, 0, 64, 0) !== 64 || dosHeader.toString('ascii', 0, 2) !== 'MZ') return false;
      const peHeader = Buffer.alloc(6);
      if (fs.readSync(descriptor, peHeader, 0, 6, dosHeader.readUInt32LE(60)) !== 6
        || peHeader.readUInt32LE(0) !== 0x4550) return false;
      return peHeader.readUInt16LE(4) === (target.arch === 'x64' ? 0x8664 : 0xaa64);
    } finally {
      fs.closeSync(descriptor);
    }
  }
  if (target.platform === 'darwin') {
    const run = dependencies.execFileSync ?? execFileSync;
    const architectures = run('lipo', ['-archs', executablePath], { encoding: 'utf8' })
      .trim()
      .split(/\s+/);
    if (!architectures.includes(target.arch === 'x64' ? 'x86_64' : target.arch)) return false;
    dependencies.verifyDarwinSignature?.(executablePath);
    return true;
  }

  const header = (dependencies.readElfHeader ?? readElfHeader)(executablePath);
  if (header.length < 20) return false;
  if (!header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return false;
  const littleEndian = header[5] === 1;
  if (!littleEndian && header[5] !== 2) return false;
  const machine = littleEndian ? header.readUInt16LE(18) : header.readUInt16BE(18);
  return machine === (target.arch === 'x64' ? 0x3e : 0xb7);
}

export function shouldPrepareComputerUse(platform) {
  return platform === 'darwin';
}

function readElfHeader(executablePath) {
  const header = Buffer.alloc(20);
  const descriptor = fs.openSync(executablePath, 'r');
  try {
    if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length) {
      return Buffer.alloc(0);
    }
    return header;
  } finally {
    fs.closeSync(descriptor);
  }
}
