import type { Automation, WorkItem } from './contracts';
import { workItemAssignmentKey } from './work-assignments';
import { workItemDisplayIdentifier } from './work-item-prompts';

export const automationSelectionOutputSchema = {
  type: 'object',
  properties: {
    workItemIds: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['workItemIds'],
  additionalProperties: false,
};

export function automationSelectionPrompt(automation: Automation, candidates: WorkItem[]): string {
  return [
    'Select the work items that match the automation criteria.',
    '',
    'Backlog sources and execution repositories in scope:',
    ...automation.repositories.map((repository) => (
      `- ${repository.repositoryId} (local clone: ${repository.sourceRepositoryPath})`
    )),
    '',
    'Selection criteria:',
    automation.selectionPrompt?.trim() || 'Select every actionable open item.',
    '',
    'Eligible unassigned work items:',
    ...candidates.map(formatCandidate),
  ].join('\n');
}

export function parseAutomationSelection(value: string, candidates: WorkItem[]): WorkItem[] {
  const parsed = JSON.parse(value) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.workItemIds)) {
    throw new Error('Automation picker returned an invalid selection.');
  }

  const candidateById = new Map(candidates.map((item) => [workItemAssignmentKey(item), item]));
  const selected = new Map<string, WorkItem>();
  for (const value of parsed.workItemIds) {
    if (typeof value !== 'string') {
      throw new Error('Automation picker returned an invalid work item ID.');
    }
    const item = candidateById.get(value);
    if (item) selected.set(value, item);
  }
  return [...selected.values()];
}

function formatCandidate(item: WorkItem): string {
  const details = [
    `${item.kind === 'pullRequest' ? 'Pull request' : 'Issue'} ${workItemDisplayIdentifier(item)}: ${item.title}`,
    item.labels.length > 0 ? `labels: ${item.labels.map((label) => label.name).join(', ')}` : null,
    item.assignees && item.assignees.length > 0 ? `assignees: ${item.assignees.join(', ')}` : null,
    item.authorName ? `author: ${item.authorName}` : null,
    `updated: ${item.updatedAt}`,
  ].filter((value): value is string => Boolean(value));
  const body = item.body?.trim();
  return [
    `- ID: ${workItemAssignmentKey(item)}`,
    `  ${item.provider === 'linear' ? 'Backlog source' : 'Repository'}: ${item.repositoryFullName}`,
    `  ${details.join(' · ')}`,
    `  URL: ${item.url}`,
    ...(body ? [`  Body: ${truncate(body)}`] : []),
  ].join('\n');
}

function truncate(value: string): string {
  return value.length <= 2_000 ? value : `${value.slice(0, 2_000).trimEnd()}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
