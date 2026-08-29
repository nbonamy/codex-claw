
import { translate } from './i18n';
import {
  desktopClawHostCapabilities,
  webClawHostCapabilities,
  type ClawClient,
  type ClawHostCapabilities,
} from '@codex-claw/core/client';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import { ElMessageBox } from 'element-plus';

export const CODEX_APP_DEEP_LINK = 'codex://' as const;
export const CHATGPT_PLUGINS_URL = 'https://chatgpt.com/plugins' as const;

export type ClawPlatformActions = {
  launchChatGpt(): void | Promise<void>;
  managePlugins(): void | Promise<void>;
  openExternal?: (url: string) => void | Promise<void>;
};

export let codexClawApi: CodexClawApi | undefined;
export let clawHostCapabilities: Readonly<ClawHostCapabilities> = webClawHostCapabilities;
export let clawClientPlatform: ClawClient['platform'] = 'web';
export let clawPlatformActions: Readonly<ClawPlatformActions> = webPlatformActions();

export function configureClawClient(client?: ClawClient): void {
  codexClawApi = client?.api;
  clawClientPlatform = client?.platform ?? 'web';
  if (client?.platform === 'desktop') {
    clawHostCapabilities = desktopClawHostCapabilities;
    clawPlatformActions = desktopPlatformActions(client.api);
    return;
  }
  clawHostCapabilities = webClawHostCapabilities;
  clawPlatformActions = webPlatformActions();
}

function desktopPlatformActions(api: CodexClawApi | undefined): Readonly<ClawPlatformActions> {
  const launchChatGpt = async () => {
    if (typeof api?.launchChatGptApp !== 'function') {
      throw new Error(translate('surface.platform-api.chatGPTCouldNotBeLaunchedFromThisWindow'));
    }
    const result = await api.launchChatGptApp();
    if (result.status !== 'alreadyRunning') return;
    if (!await confirmChatGptRelaunch()) return;
    await api.launchChatGptApp({ quitRunning: true });
  };
  return {
    launchChatGpt,
    managePlugins: launchChatGpt,
  };
}

async function confirmChatGptRelaunch(): Promise<boolean> {
  try {
    await ElMessageBox.confirm(
      translate('surface.platform-api.chatGPTIsAlreadyOpenCodexClawNeedsToRelaunchItWithClawSI'),
      translate('surface.platform-api.quitAndRelaunchChatGPT'),
      {
        cancelButtonText: translate('common.cancel'),
        confirmButtonText: translate('dynamic.misc.quitAndRelaunch'),
        type: 'warning',
      },
    );
    return true;
  } catch {
    return false;
  }
}

function webPlatformActions(): Readonly<ClawPlatformActions> {
  return {
    launchChatGpt: () => {
      window.location.assign(CODEX_APP_DEEP_LINK);
    },
    managePlugins: () => openExternal(CHATGPT_PLUGINS_URL),
    openExternal,
  };
}

function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
