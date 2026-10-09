import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** CI exercises the shipped helper with the same minimal PATH as the packaged Node runtime. */
export function checkPackagedMobileSimulator(resources, expectedRelease, env) {
  const directory = path.join(resources, 'mobile-simulator');
  const release = JSON.parse(fs.readFileSync(path.join(directory, 'release.json'), 'utf8'));
  if (release.version !== expectedRelease.version || release.sha256 !== expectedRelease.sha256) throw new Error('Incorrect bundled iOS companion release.');
  for (const file of ['idb.proto', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'Resources/SimulatorFrameworkBridge-iOS']) {
    if (!fs.existsSync(path.join(directory, file))) throw new Error(`Missing bundled iOS resource: ${file}.`);
  }
  const output = execFileSync(path.join(directory, 'idb_companion'), ['--version'], { env, encoding: 'utf8', timeout: 15_000 });
  if (!JSON.parse(output).build_date) throw new Error('Bundled iOS companion did not return version metadata.');
}
