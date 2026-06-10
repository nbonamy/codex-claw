import type { LoopInstructions, WorkItem } from './contracts';
import { workItemAssignmentKey } from './work-assignments';

export function workItemAssignmentPrompt(item: WorkItem, instructions: Pick<LoopInstructions, 'assignment'> = {}): string {
  const body = truncateWorkItemBody(item.body?.trim() ?? '');
  const assignmentInstructions = instructions.assignment?.trim();
  const workItemId = workItemAssignmentKey(item);
  return [
    `Please take this ${workProviderLabel(item.provider)} issue and drive it to completion.`,
    '',
    `Work item ID: ${workItemId}`,
    'When you are done with this work item, call the codex_claw MCP tool `mark-work-item-completed` with this exact Work item ID.',
    '',
    `Repository: ${item.repositoryFullName}`,
    `Issue: #${item.number} ${item.title}`,
    `URL: ${item.url}`,
    item.labels.length > 0 ? `Labels: ${item.labels.map((label) => label.name).join(', ')}` : null,
    item.authorName ? `Author: ${item.authorName}` : null,
    assignmentInstructions ? ['Assignment instructions:', assignmentInstructions].join('\n') : null,
    body ? ['Body:', body].join('\n') : null,
  ].filter((line): line is string => line !== null).join('\n');
}

export function workProviderLabel(provider: WorkItem['provider']): string {
  if (provider === 'github') {
    return 'GitHub';
  }
  provider satisfies never;
  return 'work provider';
}

function truncateWorkItemBody(value: string): string {
  const maxLength = 4_000;
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trimEnd()}\n\n[Body truncated]`;
}
