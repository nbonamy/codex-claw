import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { RendererMessagePart } from '@workspace/core/contracts';

type Entry = { wireText: string; text: string; parts: RendererMessagePart[] };

/** Presentation metadata for our own admitted prompts; native ACP owns history. */
export class AcpPromptJournal {
  private replayIndex = 0;
  private constructor(private readonly file: string, private readonly entries: Entry[]) {}

  static async open(home: string, sessionId: string): Promise<AcpPromptJournal> {
    const file = path.join(home, 'korus-sessions', encodeURIComponent(sessionId), 'prompts.jsonl');
    const entries: Entry[] = [];
    const size = await stat(file).then(value => value.size).catch(error => { if (error.code === 'ENOENT') return 0; throw error; });
    if (size > 20 * 1024 * 1024) throw new Error('Antigravity prompt metadata exceeds the supported history limit.');
    if (size) for (const line of (await readFile(file, 'utf8')).split('\n').filter(Boolean)) {
      const entry = JSON.parse(line) as Entry;
      if (typeof entry.wireText !== 'string' || typeof entry.text !== 'string' || !Array.isArray(entry.parts)
        || entry.parts.some(part => part.type !== 'attachment')) throw new Error('Invalid Antigravity prompt metadata.');
      entries.push(entry);
    }
    return new AcpPromptJournal(file, entries);
  }

  async append(entry: Entry): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await appendFile(this.file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    this.entries.push(structuredClone(entry));
  }

  display(nativeText: string): { text: string; parts: RendererMessagePart[] } {
    const index = this.entries.findIndex((candidate, index) => {
      if (index < this.replayIndex) return false;
      const text = candidate.wireText.replace(/^\/plan\s*/, '').trimStart();
      return text.length > 0 && nativeText.trimStart().startsWith(text);
    });
    const entry = this.entries[index];
    if (entry) this.replayIndex = index + 1;
    return entry ? structuredClone({ text: entry.text, parts: entry.parts }) : { text: nativeText, parts: [] };
  }
}
