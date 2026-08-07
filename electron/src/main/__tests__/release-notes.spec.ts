import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type ReleaseNotesScript = {
  assertReleaseNotesCurrent: (actual: string, expected: string) => void;
  assertVersionConsistency: (input: {
    rootPackage: { version?: string };
    workspaces: Array<{ path: string; manifest: { version?: string; dependencies?: Record<string, string> } }>;
    lockfile: { version?: string; packages?: Record<string, { version?: string; dependencies?: Record<string, string> }> };
  }) => string;
  createReleaseNotes: (input: { version: string; changelog: string }) => {
    schemaVersion: number;
    version: string;
    releasedAt: string;
    sourceSha256: string;
    markdown: string;
  };
};

async function loadScript(): Promise<ReleaseNotesScript> {
  // @ts-expect-error release-notes.mjs is an executable Node script with testable exports.
  return await import('../../../../scripts/release-notes.mjs') as ReleaseNotesScript;
}

describe('release-notes script', () => {
  it('freezes the package version, date, markdown, and source digest', async () => {
    const { createReleaseNotes } = await loadScript();
    const notes = createReleaseNotes({
      version: '0.5.0',
      changelog: [
        '# Changelog',
        '',
        '## Unreleased',
        '',
        '## [0.5.0] - 2026-08-04',
        '',
        '### New features',
        '',
        '- Added What’s New.',
        '',
        '## [0.4.0] - 2026-08-03',
        '',
        '- Previous release.',
      ].join('\n'),
    });

    expect(notes).toStrictEqual({
      schemaVersion: 1,
      version: '0.5.0',
      releasedAt: '2026-08-04',
      sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      markdown: '### New features\n\n- Added What’s New.',
    });
  });

  it('rejects a changelog without the package release section', async () => {
    const { assertReleaseNotesCurrent, createReleaseNotes } = await loadScript();
    expect(() => createReleaseNotes({
      version: '0.5.0',
      changelog: '## [0.4.0] - 2026-08-03\n\n- Previous release.',
    })).toThrow('CHANGELOG.md must contain a release heading for 0.5.0');
    expect(() => assertReleaseNotesCurrent('{"version":"0.4.0"}', '{"version":"0.5.0"}'))
      .toThrow('release-notes.json is stale');
  });

  it('rejects workspace and lockfile version drift', async () => {
    const { assertVersionConsistency } = await loadScript();
    const consistentInput = {
      rootPackage: { version: '0.5.0' },
      workspaces: [{
        path: 'electron/package.json',
        manifest: { version: '0.5.0', dependencies: { '@codex-claw/core': '0.5.0' } },
      }],
      lockfile: {
        version: '0.5.0',
        packages: {
          '': { version: '0.5.0' },
          electron: { version: '0.5.0', dependencies: { '@codex-claw/core': '0.5.0' } },
        },
      },
    };

    expect(assertVersionConsistency(consistentInput)).toBe('0.5.0');
    expect(() => assertVersionConsistency({
      ...consistentInput,
      workspaces: [{ path: 'electron/package.json', manifest: { version: '0.4.0' } }],
    })).toThrow('electron/package.json version 0.4.0 does not match root version 0.5.0');
    expect(() => assertVersionConsistency({
      ...consistentInput,
      lockfile: { ...consistentInput.lockfile, version: '0.4.0' },
    })).toThrow('package-lock.json root version does not match 0.5.0');
  });

  it('keeps the release check in the root make command path', () => {
    const rootPackage = JSON.parse(readFileSync(resolve(process.cwd(), '../package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const electronPackage = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(rootPackage.scripts.make).toContain('npm run make -w @codex-claw/electron');
    expect(electronPackage.scripts.make).toContain('npm run release-notes:check');
  });
});
