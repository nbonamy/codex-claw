import { afterEach, describe, expect, it, vi } from 'vitest';
import { bundledCodexVersion } from '@codex-claw/core/codex-release';
import { resolveCodexCommand } from '../codex-command';

describe('resolveCodexCommand', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('keeps an explicit Settings executable path authoritative', () => {
    expect(resolveCodexCommand(' /opt/homebrew/bin/codex ', {
      bundledPath: '/app/resources/codex/codex',
      existsSync: () => true,
    })).toBe('/opt/homebrew/bin/codex');
  });

  it('uses the Codex executable bundled with the local app', () => {
    expect(resolveCodexCommand('', {
      bundledPath: ' /app/resources/codex/codex ',
      existsSync: () => true,
    })).toBe('/app/resources/codex/codex');
  });

  it('launches the managed remote Codex installation when it is present', () => {
    vi.stubEnv('CODEX_CLAW_HOME', '/home/mnmt/.codex-claw');
    const managedCodex = `/home/mnmt/.codex-claw/codex/${bundledCodexVersion}/bin/codex`;
    expect(resolveCodexCommand('', {
      bundledPath: '',
      existsSync: (candidate) => candidate === managedCodex,
    })).toBe(managedCodex);
  });

  it('defers app bundle discovery to the SDK when Claw has no managed executable', () => {
    expect(resolveCodexCommand('', {
      bundledPath: ' ',
      existsSync: (candidate) => candidate === '/Applications/ChatGPT.app/Contents/Resources/codex',
    })).toBeUndefined();
  });

  it('leaves normal executable discovery enabled when no local bundle is provided', () => {
    expect(resolveCodexCommand(undefined, {
      bundledPath: ' ',
      existsSync: () => false,
    })).toBeUndefined();
  });
});
