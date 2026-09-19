import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const buildDirectory = path.resolve(__dirname, '..');

describe('macOS Info.plist', () => {
  it('declares why Codex Claw accesses local development services', async () => {
    const infoPlist = await readFile(path.join(buildDirectory, 'Info.plist'), 'utf8');

    expect(infoPlist).toContain('<key>NSLocalNetworkUsageDescription</key>');
    expect(infoPlist).toContain(
      '<string>Codex Claw connects to development services and repositories on your local network.</string>',
    );
  });
});
