import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopClawHostCapabilities, webClawHostCapabilities } from '@codex-claw/core/client';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import {
  CHATGPT_PLUGINS_URL,
  CODEX_APP_DEEP_LINK,
  clawClientPlatform,
  clawHostCapabilities,
  clawPlatformActions,
  configureClawClient,
} from '../platform-api';

describe('Claw renderer platform profiles', () => {
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
    await clawPlatformActions.launchChatGpt();
    await clawPlatformActions.managePlugins();
    expect(launchChatGptApp).toHaveBeenCalledTimes(2);
  });

  it('owns the web profile and opens plugin management on ChatGPT web', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    configureClawClient({ api: {} as CodexClawApi, platform: 'web' });

    expect(clawClientPlatform).toBe('web');
    expect(clawHostCapabilities).toBe(webClawHostCapabilities);
    expect(clawPlatformActions.launchChatGpt).toBeTypeOf('function');
    expect(CODEX_APP_DEEP_LINK).toBe('codex://');
    await clawPlatformActions.managePlugins();
    expect(open).toHaveBeenCalledWith(CHATGPT_PLUGINS_URL, '_blank', 'noopener,noreferrer');
  });
});
