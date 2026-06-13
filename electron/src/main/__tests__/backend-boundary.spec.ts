import { readdir, readFile } from 'node:fs/promises';
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
    expect(source).not.toContain('ClawBackendProxyDriver');
    expect(source).toContain('createRuntimeClawBackendClient');
  });

  it('keeps provider implementation directories out of Electron main', async () => {
    const mainDir = path.resolve(__dirname, '..');
    await expect(readdir(path.join(mainDir, 'codex'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readdir(path.join(mainDir, 'claude'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readdir(path.join(mainDir, 'backends'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps workspace file reads behind clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toMatch(/from ['"]node:fs/);
    expect(source).not.toMatch(/from ['"]fs/);
    expect(source).not.toContain('driver/readFile');
    expect(source).not.toContain('driver/listFiles');
    expect(source).toContain("request('agent/previewFile'");
    expect(source).toContain('agentId');
  });

  it('keeps durable snapshot persistence in clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toContain('AppStatePersistence');
    expect(source).not.toContain('state.json');
    expect(source).not.toContain('persistSnapshot');
    expect(source).toContain("request<unknown>('snapshot/get')");
  });

  it('keeps source folder auto-detection in clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toContain('source/detectFolder');
  });

  it('keeps system permission API ownership in clawd', async () => {
    const appControllerPath = path.resolve(__dirname, '../app-controller.ts');
    const source = await readFile(appControllerPath, 'utf8');

    expect(source).not.toContain('./system-permissions');
    expect(source).toContain("request('system/getPermissions')");
    expect(source).toContain("request('system/openAccessibilitySettings')");
  });

  it('keeps shell PATH repair out of Electron startup', async () => {
    const indexPath = path.resolve(__dirname, '../index.ts');
    const mainDir = path.resolve(__dirname, '..');
    const source = await readFile(indexPath, 'utf8');

    expect(source).not.toContain('fixPath');
    expect(source).not.toContain('./utils');
    expect(source).not.toContain('child_process');
    await expect(readdir(path.join(mainDir, 'utils.ts'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
