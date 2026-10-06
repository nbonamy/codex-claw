import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';

test('the packaging ZIP extractor completes large compressed files on the build runtime', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'app extract '));
  try {
    const payload = Buffer.alloc(4 * 1024 * 1024);
    for (let i = 0; i < payload.length; i++) payload[i] = (i % 256) ^ ((i >> 8) & 255) ^ ((i * 7 + 13) & 255);
    const name = Buffer.from('runtime.bin');
    const compressed = deflateRawSync(payload);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(payload), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(payload.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    local.copy(central, 6, 4, 28);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + name.length, 12);
    end.writeUInt32LE(local.length + name.length + compressed.length, 16);
    const archive = path.join(root, 'runtime.zip');
    writeFileSync(archive, Buffer.concat([local, name, compressed, central, name, end]));
    const output = path.join(root, 'output');
    const result = spawnSync(process.execPath, ['-e', "require('extract-zip')(process.argv[1],{dir:process.argv[2]}).then(()=>console.log('complete'),e=>{console.error(e);process.exitCode=1})", archive, output], {
      encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /complete/);
    assert.deepEqual(readFileSync(path.join(output, 'runtime.bin')), payload);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
