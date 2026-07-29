import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeComputerUseCommand, getComputerUseStatus, resolveComputerUseHelperAppPath, stopComputerUseHelper } from '../computer-use-tools';

describe('Computer Use desktop helper', () => {
  let tempDir: string;
  let pilotPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-claw-computer-use-'));
    pilotPath = path.join(tempDir, 'pilot');
    fs.writeFileSync(pilotPath, `#!/usr/bin/env node
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  let newline = input.indexOf('\\n');
  while (newline >= 0) {
    const request = JSON.parse(input.slice(0, newline));
    input = input.slice(newline + 1);
    process.stdout.write(JSON.stringify({ id: request.id, ok: true, result: { command: request.command, arguments: request.arguments, accessibilityTrusted: false, pid: process.pid } }) + '\\n');
    newline = input.indexOf('\\n');
  }
});
`, 'utf8');
    fs.chmodSync(pilotPath, 0o755);
  });

  afterEach(() => {
    stopComputerUseHelper();
    fs.rmSync(tempDir, { force: true, recursive: true });
  });

  it('runs the product-neutral pilot through a narrow command contract', async () => {
    await expect(executeComputerUseCommand({
      command: 'get_app_state',
      arguments: { app: 'TextEdit' },
      options: options(),
    })).resolves.toMatchObject({
      ok: true,
      result: {
        accessibilityTrusted: false,
        arguments: { app: 'TextEdit' },
        command: 'get_app_state',
      },
    });
  });

  it('reports the helper status through the bundled helper instead of Electron Accessibility state', async () => {
    await expect(getComputerUseStatus(options())).resolves.toMatchObject({
      accessibilityTrusted: false,
      available: true,
      helperPath: pilotPath,
      platform: 'darwin',
    });
  });

  it('keeps one lazy helper session alive across Computer Use commands', async () => {
    const first = await executeComputerUseCommand({ command: 'click', arguments: { x: 1, y: 1 }, options: options() });
    const second = await executeComputerUseCommand({ command: 'get_app_state', arguments: { app: 'TextEdit' }, options: options() });

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    expect((first as { result: { pid: number } }).result.pid).toBe((second as { result: { pid: number } }).result.pid);
  });

  it('reuses the latest app-state traversal limits when resolving an element index', async () => {
    await executeComputerUseCommand({
      command: 'get_app_state',
      arguments: { app: 'System Settings', maxDepth: 8, maxNodes: 500 },
      options: options(),
    });
    const click = await executeComputerUseCommand({
      command: 'click',
      arguments: { app: 'System Settings', element_index: 33 },
      options: options(),
    });

    expect(click).toMatchObject({
      ok: true,
      result: {
        arguments: {
          app: 'System Settings',
          element_index: 33,
          maxDepth: 8,
          maxNodes: 500,
        },
      },
    });
  });

  it('does not reuse traversal limits for a different app', async () => {
    await executeComputerUseCommand({
      command: 'get_app_state',
      arguments: { app: 'System Settings', maxDepth: 8 },
      options: options(),
    });
    const click = await executeComputerUseCommand({
      command: 'click',
      arguments: { app: 'TextEdit', element_index: 33 },
      options: options(),
    });

    expect(click).toMatchObject({
      ok: true,
      result: {
        arguments: {
          app: 'TextEdit',
          element_index: 33,
        },
      },
    });
  });

  it('retains traversal limits when the helper restarts after its idle TTL', async () => {
    const shortTtlOptions = () => ({ ...options(), idleTtlMs: 20 });
    const state = await executeComputerUseCommand({
      command: 'get_app_state',
      arguments: { app: 'System Settings', maxDepth: 8 },
      options: shortTtlOptions(),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const click = await executeComputerUseCommand({
      command: 'click',
      arguments: { app: 'System Settings', element_index: 33 },
      options: shortTtlOptions(),
    });

    expect((state as { result: { pid: number } }).result.pid).not.toBe((click as { result: { pid: number } }).result.pid);
    expect(click).toMatchObject({
      ok: true,
      result: {
        arguments: {
          app: 'System Settings',
          element_index: 33,
          maxDepth: 8,
        },
      },
    });
  });

  it('starts a new helper after the idle TTL expires', async () => {
    const shortTtlOptions = () => ({ ...options(), idleTtlMs: 20 });
    const first = await executeComputerUseCommand({ command: 'list_apps', arguments: {}, options: shortTtlOptions() });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const second = await executeComputerUseCommand({ command: 'list_apps', arguments: {}, options: shortTtlOptions() });

    expect((first as { result: { pid: number } }).result.pid).not.toBe((second as { result: { pid: number } }).result.pid);
  });

  it('resolves the product bundle from packaged resources', () => {
    expect(resolveComputerUseHelperAppPath({
      appPath: '/unused',
      isPackaged: true,
      platform: 'darwin',
      resourcesPath: '/Applications/Codex Claw.app/Contents/Resources',
    })).toBe('/Applications/Codex Claw.app/Contents/Resources/Codex Claw Computer Use.app');
  });

  function options() {
    return {
      appPath: tempDir,
      isPackaged: false,
      pilotPath,
      platform: 'darwin' as const,
      resourcesPath: tempDir,
    };
  }
});
