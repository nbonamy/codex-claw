import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sdkDependencies = [
  ['backend', '@codex-app-sdk/backend'],
  ['backend', '@codex-app-sdk/core'],
  ['electron', '@codex-app-sdk/electron'],
  ['vue', '@codex-app-sdk/vue'],
  ['web', '@codex-app-sdk/web'],
].map(([directory, packageName]) => {
  const packagePath = path.join(rootDir, directory, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return { directory, packageName, specifier: packageJson.dependencies?.[packageName] };
});
const localDependencies = sdkDependencies.filter(({ specifier }) => (
  typeof specifier === 'string' && specifier.startsWith('file:')
));

if (localDependencies.length === 0) {
  console.log('[build:sdk] scoped SDK packages are published; using the installed packages.');
  process.exit(0);
}
if (localDependencies.length !== sdkDependencies.length) {
  throw new Error('Scoped SDK packages must use the same local or published dependency strategy.');
}

const sdkRoots = new Set(localDependencies.map(({ directory, specifier }) => {
  const packageDirectory = path.resolve(rootDir, directory, specifier.slice('file:'.length));
  return path.resolve(packageDirectory, '..', '..');
}));
if (sdkRoots.size !== 1) {
  throw new Error('Codex Claw workspaces resolve scoped SDK packages from different repositories.');
}

const sdkRoot = [...sdkRoots][0];
if (!fs.existsSync(path.join(sdkRoot, 'package.json'))) {
  throw new Error(`Local modular Codex App SDK not found at ${sdkRoot}.`);
}

console.log(`[build:sdk] rebuilding local modular Codex App SDK at ${sdkRoot}`);
const result = spawnSync('npm', ['run', 'build'], { cwd: sdkRoot, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
