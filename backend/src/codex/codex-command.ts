import { existsSync } from 'node:fs';
import path from 'node:path';
import { bundledCodexVersion } from '@codex-claw/core/codex-release';
import { backendHomeDir } from '../state';

export type CodexCommandDependencies = {
  bundledPath?: string;
  existsSync?: (filePath: string) => boolean;
};

export function resolveCodexCommand(
  configuredPath: string | undefined,
  dependencies: CodexCommandDependencies = {},
): string | undefined {
  const explicit = configuredPath?.trim();
  if (explicit) {
    return explicit;
  }

  const bundled = (dependencies.bundledPath ?? process.env.CODEX_CLAW_BUNDLED_CODEX_PATH)?.trim();
  if (bundled) {
    return bundled;
  }

  const exists = dependencies.existsSync ?? existsSync;
  const managed = path.join(backendHomeDir(), 'codex', bundledCodexVersion, 'bin', 'codex');
  if (exists(managed)) return managed;
  return undefined;
}
