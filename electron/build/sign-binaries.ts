import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type SignDarwinBinariesDeps = {
  env?: NodeJS.ProcessEnv;
  existsSync?: (filePath: string) => boolean;
  execFileSync?: typeof execFileSync;
  logger?: Pick<typeof console, 'log' | 'warn'>;
};

export function signDarwinBinaries(
  buildPath: string,
  _arch: string,
  deps: SignDarwinBinariesDeps = {},
): void {
  const env = deps.env ?? process.env;
  const identify = env.IDENTIFY_DARWIN_CODE;
  const logger = deps.logger ?? console;

  if (!identify) {
    logger.log('IDENTIFY_DARWIN_CODE not set, skipping macOS helper signing in afterCopyExtraResources');
    return;
  }

  const existsSync = deps.existsSync ?? fs.existsSync;
  const run = deps.execFileSync ?? execFileSync;
  const binaries = resolveDarwinBinaryPaths(buildPath, existsSync);
  for (const binary of binaries) {
    if (!existsSync(binary.path)) {
      logger.warn(`${binary.label} not found for signing: ${binary.path}`);
      continue;
    }

    run('codesign', [
      '--deep',
      '--force',
      '--verbose',
      '--sign',
      identify,
      binary.path,
    ], {
      stdio: 'inherit',
    });
  }
}

function resolveDarwinBinaryPaths(
  buildPath: string,
  existsSync: (filePath: string) => boolean,
): Array<{ label: string; path: string }> {
  const normalizedBuildPath = path.normalize(buildPath);
  const resourcesAppPath = path.basename(normalizedBuildPath) === 'app'
    && path.basename(path.dirname(normalizedBuildPath)) === 'Resources'
    ? path.dirname(normalizedBuildPath)
    : null;

  const resourcePaths = [
    resourcesAppPath,
    path.extname(normalizedBuildPath) === '.app'
      ? path.join(normalizedBuildPath, 'Contents', 'Resources')
      : null,
    path.join(normalizedBuildPath, 'Codex Claw.app', 'Contents', 'Resources'),
    path.join(normalizedBuildPath, 'Electron.app', 'Contents', 'Resources'),
    path.join(normalizedBuildPath, 'Contents', 'Resources'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const helperPaths = resourcePaths.flatMap((resourcePath) => [
    path.join(resourcePath, 'apple-speechanalyzer-cli'),
    path.join(resourcePath, 'assets', 'apple-speechanalyzer-cli'),
  ]);

  const clawdNodePaths = resourcePaths.map((resourcePath) => path.join(resourcePath, 'clawd', 'node'));

  return [
    {
      label: 'Apple speech helper',
      path: helperPaths.find((helperPath) => existsSync(helperPath)) ?? helperPaths[0],
    },
    {
      label: 'clawd node runtime',
      path: clawdNodePaths.find((runtimePath) => existsSync(runtimePath)) ?? clawdNodePaths[0],
    },
  ];
}
