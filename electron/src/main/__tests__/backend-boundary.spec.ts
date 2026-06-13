import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Electron backend boundary', () => {
  it('keeps AppController behind the Claw backend protocol client', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toMatch(/from ['"]\.\/codex\//);
    expect(source).not.toMatch(/from ['"]\.\/claude\//);
    expect(source).not.toContain('new CodexBackendDriver');
    expect(source).not.toContain('new ClaudeBackendDriver');
    expect(source).toContain('ClawBackendProxyDriver');
  });
});
