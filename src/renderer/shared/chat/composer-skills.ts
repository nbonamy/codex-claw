import type { BackendSkillSummary, PromptSkillInput } from '../../../shared/contracts';

export type ActiveSkillSlash = {
  end: number;
  query: string;
  start: number;
};

export function findActiveSkillSlash(value: string, caretPosition: number): ActiveSkillSlash | null {
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
  if (/[\s/]/.test(query)) {
    return null;
  }

  return {
    end: safeCaret,
    query,
    start,
  };
}

export function filterComposerSkills(skills: BackendSkillSummary[], query: string, maxResults = -1): BackendSkillSummary[] {
  const value = query.trim().toLowerCase();
  if (!value) {
    return limitSkills(skills, maxResults);
  }

  const matches = skills
    .map((skill) => ({
      skill,
      score: Math.max(
        fuzzyScore(value, skill.name.toLowerCase()),
        fuzzyScore(value, (skill.displayName ?? '').toLowerCase()),
        fuzzyScore(value, (skill.shortDescription ?? skill.description ?? '').toLowerCase()),
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return limitSkills(matches.map((entry) => entry.skill), maxResults);
}

export function skillDisplayName(skill: BackendSkillSummary): string {
  return skill.displayName || skill.name;
}

export function skillDescription(skill: BackendSkillSummary): string {
  return skill.shortDescription || skill.description || '';
}

export function promptSkillInputsFromText(text: string, skills: BackendSkillSummary[]): PromptSkillInput[] {
  const names = new Set<string>();
  const pattern = /(?:^|[^\w.%+-])\/([A-Za-z0-9_.-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    names.add(match[1]);
  }

  return skills
    .filter((skill) => names.has(skill.name) && Boolean(skill.path))
    .map((skill) => ({
      name: skill.name,
      path: skill.path,
    }));
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

function limitSkills(skills: BackendSkillSummary[], maxResults: number): BackendSkillSummary[] {
  return maxResults >= 0 ? skills.slice(0, maxResults) : skills;
}
