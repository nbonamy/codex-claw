import { existsSync } from 'node:fs';

const chatGptCodexPath = '/Applications/ChatGPT.app/Contents/Resources/codex';

export type CodexCommandDependencies = {
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

  if ((dependencies.platform ?? process.platform) !== 'darwin') {
    return undefined;
  }

  return (dependencies.existsSync ?? existsSync)(chatGptCodexPath) ? chatGptCodexPath : undefined;
}
