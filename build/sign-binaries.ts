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
    logger.log('IDENTIFY_DARWIN_CODE not set, skipping macOS helper signing in afterCopy');
    return;
  }

  const helperPath = path.join(buildPath, '../assets/apple-speechanalyzer-cli');
  const existsSync = deps.existsSync ?? fs.existsSync;
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
