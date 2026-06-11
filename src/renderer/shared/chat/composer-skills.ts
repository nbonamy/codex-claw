import type { BackendSkillSummary, PromptSkillInput } from '../../../shared/contracts';
import { filterComposerSearchItems } from './composer-search';

export type ActiveSkillSlash = {
  end: number;
  query: string;
  start: number;
  trigger: '$' | '/';
};

export function findActiveSkillTrigger(value: string, caretPosition: number, trigger: '$' | '/' = '$'): ActiveSkillSlash | null {
  const safeCaret = Math.max(0, Math.min(caretPosition, value.length));
  const beforeCaret = value.slice(0, safeCaret);
  const start = beforeCaret.lastIndexOf(trigger);
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
    trigger,
  };
}

export function findActiveSkillSlash(value: string, caretPosition: number): ActiveSkillSlash | null {
  return findActiveSkillTrigger(value, caretPosition, '/');
}

export function filterComposerSkills(skills: BackendSkillSummary[], query: string, maxResults = -1): BackendSkillSummary[] {
  return filterComposerSearchItems(skills, query, [
    { values: (skill) => [skill.id] },
    { values: (skill) => [skill.name, skill.displayName] },
    { values: (skill) => [skill.shortDescription, skill.description] },
  ], maxResults);
}

export function skillDisplayName(skill: BackendSkillSummary): string {
  return skill.displayName || skill.name;
}

export function skillDescription(skill: BackendSkillSummary): string {
  return skill.shortDescription || skill.description || '';
}

export function promptSkillInputsFromText(text: string, skills: BackendSkillSummary[]): PromptSkillInput[] {
  const names = new Set<string>();
  const pattern = /(?:^|[^\w.%+-])[$/]([A-Za-z0-9_.-]+)/g;
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
