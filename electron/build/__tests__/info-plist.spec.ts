import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const buildDirectory = path.resolve(__dirname, '..');
const electronDirectory = path.resolve(buildDirectory, '..');

describe('macOS Info.plist', () => {
  it('declares why Codex Claw accesses local development services', async () => {
    const infoPlist = await readFile(path.join(buildDirectory, 'Info.plist'), 'utf8');

    expect(infoPlist).toContain('<key>NSLocalNetworkUsageDescription</key>');
    expect(infoPlist).toContain(
      '<string>Codex Claw connects to development services and repositories on your local network.</string>',
    );
  });

  it('extends the packaged application with the privacy usage descriptions', async () => {
    const forgeConfig = await readFile(path.join(electronDirectory, 'forge.config.ts'), 'utf8');

    expect(forgeConfig).toContain("extendInfo: 'build/Info.plist'");
  });
});
