import { existsSync } from 'node:fs';

const chatGptCodexPath = '/Applications/ChatGPT.app/Contents/Resources/codex';

export type CodexCommandDependencies = {
  bundledPath?: string;
  existsSync?: (filePath: string) => boolean;
  platform?: NodeJS.Platform;
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

  if ((dependencies.platform ?? process.platform) !== 'darwin') {
    return undefined;
  }

  return (dependencies.existsSync ?? existsSync)(chatGptCodexPath) ? chatGptCodexPath : undefined;
}
