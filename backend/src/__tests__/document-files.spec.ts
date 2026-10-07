import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { saveMarkdownFile } from '../document-files';
const homes: string[] = [];
afterEach(async () => { await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true }))); });
it('uses the owning folder, refuses implicit overwrites and symlinks, and replaces only after approval', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'document-save-test-')); homes.push(folder);
  const home = path.join(folder, 'app-data');
  const target = await saveMarkdownFile(folder, 'proposal.md', 'Original', false, home);
  await expect(saveMarkdownFile(folder, 'proposal.md', 'Replacement', false, home)).rejects.toThrow('already exists');
  expect(await readFile(target, 'utf8')).toBe('Original');
  await saveMarkdownFile(folder, target, 'Replacement', true, home);
  expect(await readFile(target, 'utf8')).toBe('Replacement');
  await symlink(target, path.join(folder, 'link.md'));
  await expect(saveMarkdownFile(folder, 'link.md', 'Bad', true, home)).rejects.toThrow('symbolic link');
  await expect(saveMarkdownFile(folder, 'settings.json', 'Bad', false, home)).rejects.toThrow('Markdown filename');
  await expect(saveMarkdownFile(undefined, 'proposal.md', '', false, home)).rejects.toThrow('workspace');
  await expect(saveMarkdownFile(folder, 'missing/doc.md', '', false, home)).rejects.toThrow();
});
it('never overwrites application-managed content and rejects an existing directory', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'document-save-test-')); homes.push(folder);
  await writeFile(path.join(folder, 'managed.md'), 'Retain');
  await expect(saveMarkdownFile(folder, 'managed.md', 'Bad', true, folder)).rejects.toThrow('application data');
  expect(await readFile(path.join(folder, 'managed.md'), 'utf8')).toBe('Retain');
});
