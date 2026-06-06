import type { BackendCommandSummary } from '../../../shared/contracts';

export type ActiveCommandSlash = {
  end: number;
  query: string;
  start: number;
};

export function findActiveCommandSlash(value: string, caretPosition: number): ActiveCommandSlash | null {
  const safeCaret = Math.max(0, Math.min(caretPosition, value.length));
  const beforeCaret = value.slice(0, safeCaret);
  const start = beforeCaret.lastIndexOf('/');
  if (start < 0) {
    return null;
  }

  const previous = start > 0 ? beforeCaret[start - 1] : '';
  if (previous && /[\w.%+-]/.test(previous)) {
    return null;
  }

  const query = beforeCaret.slice(start + 1);
  if (/[\s/$]/.test(query)) {
    return null;
  }

  return {
    end: safeCaret,
    query,
    start,
  };
}

export function filterComposerCommands(commands: BackendCommandSummary[], query: string, maxResults = -1): BackendCommandSummary[] {
  const value = query.trim().toLowerCase();
  if (!value) {
    return limitCommands(commands, maxResults);
  }

  const matches = commands
    .map((command) => ({
      command,
      score: Math.max(
        fuzzyScore(value, command.name.toLowerCase()),
        fuzzyScore(value, (command.displayName ?? '').toLowerCase()),
        fuzzyScore(value, (command.description ?? '').toLowerCase()),
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return limitCommands(matches.map((entry) => entry.command), maxResults);
}

export function commandDisplayName(command: BackendCommandSummary): string {
  return command.displayName || command.name;
}

export function commandDescription(command: BackendCommandSummary): string {
  return command.description || '';
}

function fuzzyScore(pattern: string, target: string): number {
  if (!target) {
    return 0;
  }

  let score = 0;
  let patternIndex = 0;
  let lastMatch = -1;

  for (let index = 0; index < target.length && patternIndex < pattern.length; index += 1) {
    if (target[index] !== pattern[patternIndex]) {
      continue;
    }

    score += lastMatch === index - 1 ? 6 : 1;
    if (index === 0 || '/-_. '.includes(target[index - 1])) {
      score += 4;
    }
    lastMatch = index;
    patternIndex += 1;
  }

  return patternIndex === pattern.length ? score : 0;
}

function limitCommands(commands: BackendCommandSummary[], maxResults: number): BackendCommandSummary[] {
  return maxResults >= 0 ? commands.slice(0, maxResults) : commands;
}
