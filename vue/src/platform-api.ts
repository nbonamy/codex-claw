import {
  desktopClawHostCapabilities,
  webClawHostCapabilities,
  type ClawClient,
  type ClawHostActions,
  type ClawHostCapabilities,
} from '@codex-claw/core/client';
import type { CodexClawApi } from '@codex-claw/core/contracts';

export const CODEX_APP_DEEP_LINK = 'codex://' as const;
export const CHATGPT_PLUGINS_URL = 'https://chatgpt.com/plugins' as const;

export let codexClawApi: CodexClawApi | undefined;
export let clawHostCapabilities: Readonly<ClawHostCapabilities> = webClawHostCapabilities;
export let clawClientPlatform: ClawClient['platform'] = 'web';
export let clawHostActions: Readonly<ClawHostActions> = webHostActions();

export function configureClawClient(client?: ClawClient): void {
  codexClawApi = client?.api;
  clawClientPlatform = client?.platform ?? 'web';
  if (client?.platform === 'custom') {
    clawHostCapabilities = client.capabilities;
    clawHostActions = client.actions;
    return;
  }
  if (client?.platform === 'desktop') {
    clawHostCapabilities = desktopClawHostCapabilities;
    clawHostActions = desktopHostActions(client.api);
    return;
  }
  clawHostCapabilities = webClawHostCapabilities;
  clawHostActions = webHostActions();
}

function desktopHostActions(api: CodexClawApi | undefined): Readonly<ClawHostActions> {
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

function webHostActions(): Readonly<ClawHostActions> {
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
