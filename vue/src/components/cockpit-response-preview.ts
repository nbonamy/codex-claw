import type { AgentConversationView } from '../app-state';

// Read existing provider replicas only; opening Cockpit must not load every transcript.
export function cockpitResponsePreview(view: Pick<AgentConversationView, 'codexSnapshot' | 'claudeSnapshot'> | null | undefined): string {
  const messages = view?.codexSnapshot?.messages ?? view?.claudeSnapshot?.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role !== 'assistant' || message.kind === 'compaction') continue;
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex--) {
      const part = message.parts[partIndex]!;
      const text = part.type === 'text' ? part.text
        : part.type === 'reasoning' && view?.codexSnapshot ? part.summary : '';
      const line = text.split(/\r?\n/u).map(line => line.trim()).find(Boolean);
      if (line) return line;
    }
  }
  return '';
}
