import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopClawHostCapabilities, webClawHostCapabilities } from '@codex-claw/core/client';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import {
  CHATGPT_PLUGINS_URL,
  CODEX_APP_DEEP_LINK,
  clawClientPlatform,
  clawHostActions,
  clawHostCapabilities,
  configureClawClient,
} from '../platform-api';

describe('Claw renderer host profiles', () => {
  afterEach(() => {
    configureClawClient(undefined);
    vi.restoreAllMocks();
  });

  it('owns the desktop profile and launches ChatGPT through the desktop API', async () => {
    const launchChatGptApp = vi.fn().mockResolvedValue(undefined);
    configureClawClient({
      api: { launchChatGptApp } as unknown as CodexClawApi,
      platform: 'desktop',
    });

    expect(clawClientPlatform).toBe('desktop');
    expect(clawHostCapabilities).toBe(desktopClawHostCapabilities);
    await clawHostActions.launchChatGpt?.();
    await clawHostActions.managePlugins?.();
    expect(launchChatGptApp).toHaveBeenCalledTimes(2);
  });

  it('owns the web profile and opens plugin management on ChatGPT web', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    configureClawClient({ api: {} as CodexClawApi, platform: 'web' });

    expect(clawClientPlatform).toBe('web');
    expect(clawHostCapabilities).toBe(webClawHostCapabilities);
    expect(clawHostActions.launchChatGpt).toBeTypeOf('function');
    expect(CODEX_APP_DEEP_LINK).toBe('codex://');
    await clawHostActions.managePlugins?.();
    expect(open).toHaveBeenCalledWith(CHATGPT_PLUGINS_URL, '_blank', 'noopener,noreferrer');
  });

  it('requires a custom host to supply its exact profile and actions', () => {
    const capabilities = {
      ...webClawHostCapabilities,
      chromePlugin: false,
      codexResourceSharing: false,
      remoteAgentConnections: false,
    };
    const actions = { managePlugins: vi.fn(), openExternal: vi.fn() };
    configureClawClient({
      api: {} as CodexClawApi,
      actions,
      capabilities,
      platform: 'custom',
    });

    expect(clawClientPlatform).toBe('custom');
    expect(clawHostCapabilities).toBe(capabilities);
    expect(clawHostActions).toBe(actions);
    expect(clawHostActions.launchChatGpt).toBeUndefined();
  });
});
