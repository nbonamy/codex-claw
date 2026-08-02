import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { launchChatGptApp } from '../chatgpt-app';

describe('launchChatGptApp', () => {
  it('opens the application from /Applications with Claw isolated Codex home', async () => {
    const execFile = vi.fn().mockResolvedValue(undefined);
    const existsSync = vi.fn().mockReturnValue(true);

    await launchChatGptApp({
      clawHome: '/Users/nico/.codex-claw',
      execFile,
      existsSync,
      platform: 'darwin',
    });

    expect(existsSync).toHaveBeenCalledWith('/Applications/ChatGPT.app');
    expect(execFile).toHaveBeenCalledWith('/usr/bin/open', [
      '-n',
      '--env',
      `CODEX_HOME=${path.join('/Users/nico/.codex-claw', 'codex-home')}`,
      '-a',
      '/Applications/ChatGPT.app',
    ]);
  });

  it('reports when ChatGPT is not installed in /Applications', async () => {
    await expect(launchChatGptApp({
      existsSync: () => false,
      platform: 'darwin',
    })).rejects.toThrow('ChatGPT is not installed at /Applications/ChatGPT.app.');
  });

  it('rejects unsupported platforms without attempting to launch', async () => {
    const execFile = vi.fn();

    await expect(launchChatGptApp({
      execFile,
      platform: 'linux',
    })).rejects.toThrow('Launching the ChatGPT app is only supported on macOS.');

    expect(execFile).not.toHaveBeenCalled();
  });
});
