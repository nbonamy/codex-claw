import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const forbiddenImports = [
  '@codex-app-sdk/electron',
  '@codex-app-sdk/vue',
  '@codex-app-sdk/web',
  '@vue/',
  'electron',
  'vue',
];

describe('@codex-claw/core package boundary', () => {
  it('does not depend on UI or host adapter packages', () => {
    const sourceRoot = path.resolve(import.meta.dirname, '..');
    const violations = sourceFiles(sourceRoot)
      .filter((filePath) => !filePath.includes(`${path.sep}__tests__${path.sep}`))
      .flatMap((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        return forbiddenImports
          .filter((specifier) => source.includes(`from '${specifier}`) || source.includes(`from "${specifier}`))
          .map((specifier) => `${path.relative(sourceRoot, filePath)} -> ${specifier}`);
      });

    expect(violations).toStrictEqual([]);
  });
});

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filePath);
    return entry.isFile() && filePath.endsWith('.ts') ? [filePath] : [];
  });
}
