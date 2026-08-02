import { execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { runtimeClawdHome } from './runtime-config';

const defaultChatGptAppPath = '/Applications/ChatGPT.app';
const defaultOpenCommand = '/usr/bin/open';
const execFile = promisify(execFileCallback);

export type ChatGptAppDependencies = {
  appPath?: string;
  clawHome?: string;
  execFile?: (command: string, args: readonly string[]) => Promise<unknown>;
  existsSync?: (filePath: string) => boolean;
  openCommand?: string;
  platform?: NodeJS.Platform;
};

export async function launchChatGptApp(dependencies: ChatGptAppDependencies = {}): Promise<void> {
  const platform = dependencies.platform ?? process.platform;
  if (platform !== 'darwin') {
    throw new Error('Launching the ChatGPT app is only supported on macOS.');
  }

  const appPath = dependencies.appPath ?? defaultChatGptAppPath;
  const fileExists = dependencies.existsSync ?? existsSync;
  if (!fileExists(appPath)) {
    throw new Error(`ChatGPT is not installed at ${appPath}.`);
  }

  const clawHome = dependencies.clawHome ?? runtimeClawdHome();
  const codexHome = path.join(clawHome, 'codex-home');
  const run = dependencies.execFile ?? execFile;
  await run(dependencies.openCommand ?? defaultOpenCommand, [
    '-n',
    '--env',
    `CODEX_HOME=${codexHome}`,
    '-a',
    appPath,
  ]);
}
