import fs from 'node:fs/promises';
import path from 'node:path';
import { targets, validateIdentity, verifyTarget, checksum } from './release-contract.mjs';
import nodeRelease from '../node-runtime-release.json' with { type: 'json' };
import codexRelease from '../codex-app-server-release.json' with { type: 'json' };
import product from '../core/src/product.json' with { type: 'json' };

const root = path.resolve(import.meta.dirname, '..');

export async function collectArtifacts({ source, output, identity, target, signing }) {
  validateIdentity(identity);
  if (!targets.includes(target)) throw new Error(`Unsupported target: ${target}`);
  await fs.mkdir(output, { recursive: true });
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && /\.(zip|dmg|exe|nupkg|deb|rpm)$|^RELEASES(\.json)?$/.test(entry.name)) {
        const extension = path.extname(entry.name);
        // Squirrel's RELEASES references the original nupkg filename. Keep both intact.
        const name = extension === '.dmg' ? product.downloadFileName
          : extension === '.exe' ? `${product.slug}-${target}-setup.exe`
          : ['.zip', '.deb', '.rpm'].includes(extension) ? `${product.slug}-${target}${extension}` : entry.name;
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || files.some(item => item.name === name)) throw new Error(`Unsafe/duplicate artifact name: ${name}`);
        await fs.copyFile(file, path.join(output, name));
        files.push({ name, size: (await fs.stat(file)).size, sha256: await checksum(file) });
      }
    }
  }
  await visit(source);
  files.sort((a, b) => a.name.localeCompare(b.name));
  await fs.writeFile(path.join(output, 'provenance.json'), JSON.stringify({ schemaVersion: 1,
    ...identity, target, signing, nodeVersion: nodeRelease.version, codexVersion: codexRelease.version,
    lockfileSha256: await checksum(path.join(root, 'package-lock.json')), files }, null, 2) + '\n');
  await verifyTarget(output, identity, target);
}
