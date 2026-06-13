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
  const helperPath = resolveAppleSpeechHelperPath(buildPath, existsSync);
  if (!existsSync(helperPath)) {
    logger.warn(`Apple speech helper not found for signing: ${helperPath}`);
    return;
  }

  const run = deps.execFileSync ?? execFileSync;
  run('codesign', [
    '--deep',
    '--force',
    '--verbose',
    '--sign',
    identify,
    helperPath,
  ], {
    stdio: 'inherit',
  });
}

function resolveAppleSpeechHelperPath(
  buildPath: string,
  existsSync: (filePath: string) => boolean,
): string {
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

  return helperPaths.find((helperPath) => existsSync(helperPath)) ?? helperPaths[0];
}
