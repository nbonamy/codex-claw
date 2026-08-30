import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type SignDarwinBinariesDeps = {
  env?: NodeJS.ProcessEnv;
  existsSync?: (filePath: string) => boolean;
  execFileSync?: typeof execFileSync;
  logger?: Pick<typeof console, 'log' | 'warn'>;
};

const bundledCodexPathSuffixes = [
  path.join('Contents', 'Resources', 'codex', 'codex'),
  path.join('Contents', 'Resources', 'codex', 'codex-code-mode-host'),
];

export function shouldPreserveUpstreamCodexSignature(filePath: string): boolean {
  const normalizedPath = path.normalize(filePath);
  return bundledCodexPathSuffixes.some((suffix) => normalizedPath === suffix
    || normalizedPath.endsWith(`${path.sep}${suffix}`));
}

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
      throw new Error(`${binary.label} not found for signing: ${binary.path}`);
    }

    run('codesign', [
      '--force',
      '--verbose',
      '--options',
      'runtime',
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

  const binaryPaths = resourcePaths.flatMap((resourcePath) => [
    {
      label: 'Apple speech helper',
      path: path.join(resourcePath, 'apple-speechanalyzer-cli'),
    },
    {
      label: 'Apple speech helper',
      path: path.join(resourcePath, 'assets', 'apple-speechanalyzer-cli'),
    },
  ]);
  const computerUseAppPaths = resourcePaths.map((resourcePath) => ({
    label: 'Computer Use helper app',
    path: path.join(resourcePath, 'Codex Claw Computer Use.app'),
  }));

  const appleSpeechHelper = binaryPaths.find((binary) => existsSync(binary.path)) ?? binaryPaths[0];
  const computerUseHelper = computerUseAppPaths.find((binary) => existsSync(binary.path)) ?? computerUseAppPaths[0];
  return [appleSpeechHelper, computerUseHelper];
}
