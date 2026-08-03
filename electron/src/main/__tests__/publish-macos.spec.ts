import { describe, expect, it, vi } from 'vitest';

type PublishMacosScript = {
  assertVersionNotAlreadyPublished: (input: {
    currentVersion: string;
    publishedManifest: null | { currentRelease?: string };
  }) => void;
  checkPublishedVersion: (input: {
    currentVersion: string;
    execFileSyncImpl: (file: string, args: string[], options: { encoding: string }) => string;
    host?: string;
    remoteManifest?: string;
  }) => void;
  parsePublishedManifest: (rawManifest: string) => null | { currentRelease?: string };
};

async function loadScript(): Promise<PublishMacosScript> {
  // @ts-expect-error publish-macos.mjs is an executable Node script with testable exports.
  return await import('../../../../scripts/publish-macos.mjs') as PublishMacosScript;
}

describe('publish-macos script', () => {
  it('rejects publishing the current remote version', async () => {
    const { assertVersionNotAlreadyPublished } = await loadScript();

    expect(() => assertVersionNotAlreadyPublished({
      currentVersion: '0.3.0',
      publishedManifest: { currentRelease: '0.3.0' },
    })).toThrow('Codex Claw version 0.3.0 is already published');
  });

  it('checks the remote manifest before publishing', async () => {
    const { checkPublishedVersion } = await loadScript();
    const execFileSyncImpl = vi.fn(() => JSON.stringify({ currentRelease: '0.2.0' }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    checkPublishedVersion({
      currentVersion: '0.3.0',
      execFileSyncImpl,
      host: 'test-host',
      remoteManifest: '/srv/codex-claw/RELEASES.json',
    });

    expect(execFileSyncImpl).toHaveBeenCalledWith(
      'ssh',
      ['test-host', "test -f '/srv/codex-claw/RELEASES.json' && cat '/srv/codex-claw/RELEASES.json' || true"],
      { encoding: 'utf8' },
    );
    expect(log).toHaveBeenCalledWith('Latest published Codex Claw version is 0.2.0; local version is 0.3.0.');
    log.mockRestore();
  });

  it('parses an absent release manifest as no release', async () => {
    const { parsePublishedManifest } = await loadScript();
    expect(parsePublishedManifest('')).toBeNull();
    expect(parsePublishedManifest('\n')).toBeNull();
  });
});
