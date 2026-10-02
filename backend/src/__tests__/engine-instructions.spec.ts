import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readEngineInstructions, saveEngineInstructions } from '../engine-instructions';

const homes: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true }))); });
describe('engine instruction files', () => {
  it('reads and saves Claude personalization in the configured provider home', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'claw-claude-instructions-')); homes.push(home);
    vi.stubEnv('CLAUDE_CONFIG_DIR', home);
    vi.stubEnv('HOME', path.join(home, 'personal'));
    const file = path.join(home, 'CLAUDE.md');
    expect(await readEngineInstructions('claude')).toEqual({ path: file, text: '' });
    await saveEngineInstructions({ engine: 'claude', text: 'Use the configured instructions.\n' });
    expect(await readFile(file, 'utf8')).toBe('Use the configured instructions.\n');
    expect(await readEngineInstructions('claude')).toEqual({ path: file, text: 'Use the configured instructions.\n' });
  });
  it('reads missing files as empty and saves exactly the selected global file', async () => {
    const home = await mkdtemp(path.join(tmpdir(), 'claw-instructions-')); homes.push(home);
    expect(await readEngineInstructions('codex', home)).toEqual({ path: path.join(home, '.codex/AGENTS.md'), text: '' });
    await saveEngineInstructions({ engine: 'codex', text: '  Keep formatting.\n' }, home);
    expect((await readEngineInstructions('codex', home)).text).toBe('  Keep formatting.\n');
    expect((await readEngineInstructions('claude', home)).text).toBe('');
    await saveEngineInstructions({ engine: 'claude', text: 'Claude only' }, home);
    await expect(saveEngineInstructions({ engine: 'codex', text: 'Both', all: true }, home)).rejects.toThrow('confirmation');
    expect((await readEngineInstructions('claude', home)).text).toBe('Claude only');
    await saveEngineInstructions({ engine: 'codex', text: 'Both', all: true, confirmed: true }, home);
    expect((await readEngineInstructions('codex', home)).text).toBe('Both');
    expect((await readEngineInstructions('claude', home)).text).toBe('Both');
    await saveEngineInstructions({ engine: 'codex', text: '' }, home);
    expect((await readEngineInstructions('codex', home)).text).toBe('');
    await expect(readEngineInstructions('../bad' as never, home)).rejects.toThrow('Unknown');
  });
});
