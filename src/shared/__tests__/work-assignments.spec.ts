import { describe, expect, it } from 'vitest';
import type { Agent, WorkItem } from '../contracts';
import { assignedAgentsByWorkItemKey, findAssignedAgentForWorkItem, isSameWorkItem, sanitizeWorkItemAssignmentSource, workBacklogAssignmentFromWorkItem, workItemAssignmentKey } from '../work-assignments';

describe('work assignments', () => {
  it('uses provider-aware keys and finds the assigned agent', () => {
    const item = workItem(12);
    const assignment = workBacklogAssignmentFromWorkItem(item, 'agent-dina', '2026-06-09T13:00:00.000Z');
    const assignments = {
      [workItemAssignmentKey(item)]: assignment,
    };
    const agent = assignedAgent();

    expect(workItemAssignmentKey(item)).toBe('github:nbonamy/codex-claw#12');
    expect(isSameWorkItem(assignment, item)).toBe(true);
    expect(findAssignedAgentForWorkItem([agent], assignments, item)).toBe(agent);
    expect(assignedAgentsByWorkItemKey([agent], assignments)).toStrictEqual({
      'github:nbonamy/codex-claw#12': agent,
    });
  });

  it('treats assignments with missing agents as unassigned', () => {
    const item = workItem(12);
    const assignments = {
      [workItemAssignmentKey(item)]: workBacklogAssignmentFromWorkItem(item, 'missing-agent', '2026-06-09T13:00:00.000Z'),
    };

    expect(findAssignedAgentForWorkItem([assignedAgent()], assignments, item)).toBeNull();
    expect(assignedAgentsByWorkItemKey([assignedAgent()], assignments)).toStrictEqual({});
  });

  it('does not match different item ids', () => {
    expect(isSameWorkItem(workItem(12), workItem(13))).toBe(false);
  });

  it('sanitizes assignable work item payloads before they cross the main-process boundary', () => {
    expect(sanitizeWorkItemAssignmentSource(workItem(12))).toStrictEqual({
      provider: 'github',
      id: 'nbonamy/codex-claw#12',
      repositoryId: 'nbonamy/codex-claw',
      repositoryFullName: 'nbonamy/codex-claw',
      number: 12,
      title: 'Fix cockpit drag target',
      url: 'https://github.com/nbonamy/codex-claw/issues/12',
    });
    expect(sanitizeWorkItemAssignmentSource({
      ...workItem(12),
      number: '12',
    })).toBeNull();
    expect(sanitizeWorkItemAssignmentSource({
      ...workItem(12),
      provider: 'jira',
    })).toBeNull();
  });
});

function workItem(number: number): WorkItem {
  return {
    provider: 'github',
    id: `nbonamy/codex-claw#${number}`,
    repositoryId: 'nbonamy/codex-claw',
    repositoryFullName: 'nbonamy/codex-claw',
    number,
    title: 'Fix cockpit drag target',
    url: `https://github.com/nbonamy/codex-claw/issues/${number}`,
    state: 'open',
    labels: [],
    authorName: 'nbonamy',
    createdAt: '2026-06-09T12:00:00.000Z',
    updatedAt: '2026-06-09T12:30:00.000Z',
  };
}

function assignedAgent(): Agent {
  return {
    id: 'agent-dina',
    teamId: 'team-codex-claw',
    name: 'Dina',
    avatar: 'DI',
    folder: '~/src/codex-claw',
    backend: 'codex',
    backendDefaults: { kind: 'codex' },
    status: { type: 'idle' },
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
  };
}
