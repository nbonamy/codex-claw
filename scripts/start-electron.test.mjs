import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareDevelopmentShell, startElectron } from './start-electron.mjs';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const product = JSON.parse(readFileSync(new URL('../core/src/product.json', import.meta.url), 'utf8'));
test('supplies the branded Linux shell before Electron starts and preserves caller arguments', () => {
  let invocation;
  const child = {};
  const result = startElectron('linux', (...args) => { invocation = args; return child; }, ['--enable-logging'], () => '/development shell');
  assert.equal(result, child);
  assert.equal(invocation[0], process.execPath);
  assert.deepEqual(invocation[1].slice(1), ['--app-path', '/development shell', '--', '--enable-logging']);
  assert.equal(invocation[2].stdio, 'inherit');
});
test('generates startup metadata and an icon without modifying the workspace manifest', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'development-shell-'));
  try {
    mkdirSync(path.join(root, 'electron/assets'), { recursive: true });
    writeFileSync(path.join(root, 'electron/package.json'), JSON.stringify({ version: '1.2.3' }));
    writeFileSync(path.join(root, 'electron/assets/icon.png'), 'icon');
    const shell = prepareDevelopmentShell(root);
    assert.deepEqual(JSON.parse(readFileSync(path.join(shell, 'package.json'), 'utf8')), {
      name: 'desktop-development-shell', version: '1.2.3', productName: product.name,
      desktopName: `${product.appId}.development.desktop`, main: path.join(root, 'electron/.vite/build/main.js'),
    });
    assert.equal(readFileSync(path.join(shell, 'assets/icon.png'), 'utf8'), 'icon');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('does not supply a Linux desktop class on Windows', () => {
  let args;
  startElectron('win32', (_command, launchArgs) => { args = launchArgs; }, []);
  assert.deepEqual(args.slice(1), ['--']);
});
