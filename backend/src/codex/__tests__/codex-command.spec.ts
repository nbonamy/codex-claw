import { describe, expect, it } from 'vitest';
import { resolveCodexCommand } from '../codex-command';

describe('resolveCodexCommand', () => {
  it('keeps an explicit Settings executable path authoritative', () => {
    expect(resolveCodexCommand(' /opt/homebrew/bin/codex ', {
      bundledPath: '/app/resources/codex/codex',
      platform: 'darwin',
      existsSync: () => true,
    })).toBe('/opt/homebrew/bin/codex');
  });

  it('uses the Codex executable bundled with the local app', () => {
    expect(resolveCodexCommand('', {
      bundledPath: ' /app/resources/codex/codex ',
      platform: 'darwin',
      existsSync: () => true,
    })).toBe('/app/resources/codex/codex');
  });

  it('falls back to the current ChatGPT-bundled Codex app-server on macOS', () => {
    expect(resolveCodexCommand('', {
      platform: 'darwin',
      existsSync: (candidate) => candidate === '/Applications/ChatGPT.app/Contents/Resources/codex',
    })).toBe('/Applications/ChatGPT.app/Contents/Resources/codex');
  });

  it('leaves normal executable discovery enabled when no local bundle is provided', () => {
    expect(resolveCodexCommand(undefined, {
      platform: 'darwin',
      existsSync: () => false,
    })).toBeUndefined();
    expect(resolveCodexCommand(undefined, {
      platform: 'linux',
      existsSync: () => true,
    })).toBeUndefined();
  });
});
