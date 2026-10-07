import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export function speechHelperResources(workspacePath: string, platform: NodeJS.Platform): string[] {
  if (platform !== 'darwin') return [];
  // The SDK exposes ESM entrypoints, not its assets or package.json. Locate its
  // package using Node's consumer search order without loading the SDK runtime.
  const require = createRequire(path.join(workspacePath, 'package.json'));
  const packageName = '@codex-app-sdk/backend';
  const packageRoot = (require.resolve.paths(packageName) ?? [])
    .map((directory) => path.join(directory, packageName))
    .find((directory) => existsSync(path.join(directory, 'package.json')));
  if (!packageRoot) throw new Error(`Required packaged dependency is missing: ${packageName}`);
  return [path.join(packageRoot, 'assets/apple-speechanalyzer-cli')];
}
