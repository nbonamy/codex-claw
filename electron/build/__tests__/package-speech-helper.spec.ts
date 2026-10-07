import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { speechHelperResources } from '../package-speech-helper';

const fixtures: string[] = [];
afterEach(() => fixtures.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('packaged speech helper', () => {
  it.each(['hoisted', 'workspace'])('includes the installed binary from a %s SDK', (layout) => {
    const root = mkdtempSync(path.join(tmpdir(), 'speech-resource-'));
    fixtures.push(root);
    const workspace = path.join(root, 'electron');
    mkdirSync(workspace);
    const sdk = path.join(layout === 'workspace' ? workspace : root, 'node_modules/@codex-app-sdk/backend');
    mkdirSync(path.join(sdk, 'assets'), { recursive: true });
    writeFileSync(path.join(sdk, 'package.json'), JSON.stringify({
      name: '@codex-app-sdk/backend', exports: { '.': { import: './dist/index.js' } },
    }));
    writeFileSync(path.join(sdk, 'assets/apple-speechanalyzer-cli'), 'native speech helper');

    const resources = speechHelperResources(workspace, 'darwin');
    expect(resources).toHaveLength(1);
    expect(readFileSync(resources[0], 'utf8')).toBe('native speech helper');
  });

  it('does not resolve macOS resources for Windows or Linux', () => {
    expect(speechHelperResources('/missing/workspace', 'win32')).toStrictEqual([]);
    expect(speechHelperResources('/missing/workspace', 'linux')).toStrictEqual([]);
  });
});
