import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDirectories = ['backend', 'electron'];
const dependencies = packageDirectories.map((directory) => {
  const packagePath = path.join(rootDir, directory, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return { directory, specifier: packageJson.dependencies?.['codex-app-sdk'] };
});
const localDependencies = dependencies.filter(({ specifier }) => (
  typeof specifier === 'string' && specifier.startsWith('file:')
));

if (localDependencies.length === 0) {
  console.log('[build:sdk] codex-app-sdk is published; using the installed package.');
  process.exit(0);
}
if (localDependencies.length !== dependencies.length) {
  throw new Error('codex-app-sdk must use the same local or published dependency strategy in every workspace.');
}

const sdkDirectories = new Set(localDependencies.map(({ directory, specifier }) => (
  path.resolve(rootDir, directory, specifier.slice('file:'.length))
)));
if (sdkDirectories.size !== 1) {
  throw new Error('Codex Claw workspaces resolve codex-app-sdk to different local directories.');
}

const sdkDirectory = [...sdkDirectories][0];
if (!fs.existsSync(path.join(sdkDirectory, 'package.json'))) {
  throw new Error(`Local codex-app-sdk package not found at ${sdkDirectory}.`);
}

console.log(`[build:sdk] rebuilding local codex-app-sdk at ${sdkDirectory}`);
const result = spawnSync('npm', ['run', 'build'], { cwd: sdkDirectory, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
