import { chmod, copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backendDistDir = path.join(rootDir, 'backend/dist');
const resourcesDir = path.join(rootDir, 'electron/resources/clawd');
const backendBundle = path.join(backendDistDir, 'clawd.mjs');
const backendSourceMap = path.join(backendDistDir, 'clawd.mjs.map');
const nodeRuntime = process.execPath;
const nodeRuntimeName = process.platform === 'win32' ? 'node.exe' : 'node';

await assertFile(backendBundle);
await assertFile(nodeRuntime);
await mkdir(resourcesDir, { recursive: true });
await copyFile(backendBundle, path.join(resourcesDir, 'clawd.mjs'));
await copyFile(nodeRuntime, path.join(resourcesDir, nodeRuntimeName));
await chmod(path.join(resourcesDir, nodeRuntimeName), 0o755);

if (await fileExists(backendSourceMap)) {
  await copyFile(backendSourceMap, path.join(resourcesDir, 'clawd.mjs.map'));
}

console.log(`[package-backend] copied ${path.relative(rootDir, backendBundle)} and ${path.basename(nodeRuntime)} to ${path.relative(rootDir, resourcesDir)}`);

async function assertFile(filePath) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error(`${filePath} is not a file`);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`Backend bundle is missing: ${filePath}. Run npm run build -w @codex-claw/backend first.`);
    }
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await assertFile(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Backend bundle is missing:')) {
      return false;
    }
    throw error;
  }
}
