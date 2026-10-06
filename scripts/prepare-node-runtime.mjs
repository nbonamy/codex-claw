import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { prepareNodeRuntime } from './node-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: {
  platform: { type: 'string', default: process.platform },
  arch: { type: 'string', default: process.arch },
  output: { type: 'string' },
} });
const outputDir = path.resolve(values.output ?? path.join(root, 'electron/resources/runtime', `${values.platform}-${values.arch}`));
const executable = await prepareNodeRuntime({
  platform: values.platform, arch: values.arch, outputDir,
  cacheDir: path.join(root, 'electron/.runtime-cache'),
});
console.log(`[prepare-node-runtime] ${values.platform}/${values.arch}: ${executable}`);
