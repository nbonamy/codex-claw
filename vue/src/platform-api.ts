import {
  desktopClawHostCapabilities,
  webClawHostCapabilities,
  type ClawClient,
  type ClawHostCapabilities,
} from '@codex-claw/core/client';
import type { CodexClawApi } from '@codex-claw/core/contracts';

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
  const launchChatGpt = () => {
    if (typeof api?.launchChatGptApp !== 'function') {
      throw new Error('ChatGPT could not be launched from this window.');
    }
    return api.launchChatGptApp();
  };
  return {
    launchChatGpt,
    managePlugins: launchChatGpt,
  };
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
