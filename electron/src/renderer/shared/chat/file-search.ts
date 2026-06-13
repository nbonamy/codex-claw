import type { AgentFileSearchItem } from '@codex-claw/shared/contracts';

export const MAX_FILE_SEARCH_RESULTS = 50;

export function filterFileSearchItems<T extends AgentFileSearchItem>(
  files: T[],
  query: string,
  maxResults = MAX_FILE_SEARCH_RESULTS,
): T[] {
  const value = query.trim().toLowerCase();
  if (!value) {
    return files.slice(0, maxResults);
  }

  return files
    .map((file) => ({
      file,
      score: Math.max(
        fuzzyScore(value, file.name.toLowerCase()),
        fuzzyScore(value, file.path.toLowerCase()),
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((entry) => entry.file);
}

export function fuzzyScore(pattern: string, target: string): number {
  let score = 0;
  let patternIndex = 0;
  let lastMatch = -1;

  for (let index = 0; index < target.length && patternIndex < pattern.length; index += 1) {
    if (target[index] !== pattern[patternIndex]) {
      continue;
    }

    score += lastMatch === index - 1 ? 6 : 1;
    if (index === 0 || '/-_.'.includes(target[index - 1])) {
      score += 4;
    }
    lastMatch = index;
    patternIndex += 1;
  }

  return patternIndex === pattern.length ? score : 0;
}
