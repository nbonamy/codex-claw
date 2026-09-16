import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { AgentBackend } from '@codex-claw/core/contracts';

function instructionPath(engine: AgentBackend, home: string): string {
  if (engine === 'codex') return path.join(home, '.codex', 'AGENTS.md');
  if (engine === 'claude') return path.join(home, '.claude', 'CLAUDE.md');
  throw new Error('Unknown instruction engine.');
}

export async function readEngineInstructions(engine: AgentBackend, home = homedir()): Promise<{ path: string; text: string }> {
  const file = instructionPath(engine, home);
  try {
    return { path: file, text: await readFile(file, 'utf8') };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: file, text: '' };
    throw error;
  }
}

export async function saveEngineInstructions(input: { engine: AgentBackend; text: string; all?: boolean; confirmed?: boolean }, home = homedir()): Promise<void> {
  instructionPath(input.engine, home);
  if (typeof input.text !== 'string' || (input.all !== undefined && typeof input.all !== 'boolean')) throw new Error('Invalid instruction input.');
  if (input.all && input.confirmed !== true) throw new Error('Overwriting both instruction files requires confirmation.');
  const engines: AgentBackend[] = input.all ? ['codex', 'claude'] : [input.engine];
  for (const engine of engines) {
    const file = instructionPath(engine, home);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, input.text, { encoding: 'utf8', mode: 0o600 });
  }
}
