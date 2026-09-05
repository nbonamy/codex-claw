import type {
  Agent,
  AppSnapshot,
  ThreadPlan,
  ThreadPlanStep,
} from './contracts';
import type { ToolPart } from './snapshot-conversation-payloads';
import type { SnapshotEventOwnedBy } from './snapshot-event-ownership';
import {
  appendAssistantDelta,
  findAssistantMessageWithToolPart,
} from './snapshot-conversation-transcript';
import { upsertAssistantToolPart } from './snapshot-conversation-tools';

export function formatThreadPlanMarkdown(input: Pick<ThreadPlan, 'explanation' | 'steps'>): string {
  const explanation = input.explanation.trim();
  const steps = input.steps.map((entry) => {
    const marker = entry.status === 'completed' ? '- [x]' : '- [ ]';
    return `${marker} ${entry.step}`;
  });

  return [explanation, ...steps].filter(Boolean).join('\n');
}
export function threadPlan(
  payload: ConversationEventPayload<'turn.planUpdated'>,
  threadId: string,
  turnId: string,
  updatedAt: string,
): ThreadPlan | null {
  const explanation = payload.explanation?.trim()
    ? payload.explanation.trim()
    : '';
  const steps = payload.plan.map((entry): ThreadPlanStep | null => {
    const step = entry.step.trim();
    if (!step) {
      return null;
    }

    return {
      step,
      status: entry.status,
    };
  }).filter((step): step is ThreadPlanStep => Boolean(step));

  const markdown = formatThreadPlanMarkdown({ explanation, steps });
  if (!markdown) {
    return null;
  }

  return {
    threadId,
    turnId,
    kind: 'execution',
    status: executionThreadPlanStatus(steps),
    explanation,
    steps,
    markdown,
    updatedAt,
  };
}

export function executionThreadPlanStatus(steps: ThreadPlanStep[]): ThreadPlan['status'] {
  return steps.length > 0 && steps.every((step) => step.status === 'completed')
    ? 'completed'
    : 'inProgress';
}

export function finalizedThreadPlanStatus(
  plan: ThreadPlan,
  payload: ConversationEventPayload<'turn.completed'>,
): ThreadPlan['status'] {
  const turnStatus = turnCompletionStatus(payload);
  if (turnStatus === 'interrupted') return 'interrupted';
  if (turnStatus === 'failed') return 'failed';
  return plan.steps.length > 0 && plan.steps.every((step) => step.status === 'completed')
    ? 'completed'
    : 'incomplete';
}

export function turnCompletionStatus(
  payload: ConversationEventPayload<'turn.completed'>,
): string {
  if ('status' in payload && typeof payload.status === 'string') {
    return payload.status;
  }
  return 'turn' in payload ? payload.turn.status : '';
}

export function appendAgentPlanMarkdownDelta(
  agent: Agent | undefined,
  threadId: string,
  turnId: string,
  payload: ConversationEventPayload<'turn.proposedPlanDelta'>,
  updatedAt: string,
): void {
  if (!payload.delta) {
    return;
  }

  if (!agent) {
    return;
  }

  const existingMarkdown = agent.plan?.turnId === turnId ? agent.plan.markdown : '';
  setAgentPlanMarkdown(agent, threadId, turnId, `${existingMarkdown}${payload.delta}`, updatedAt, 'inProgress', { trim: false });
}

export function updateAgentPlanMarkdown(
  agent: Agent | undefined,
  threadId: string,
  turnId: string,
  payload: ConversationEventPayload<'turn.proposedPlanCompleted'>,
  updatedAt: string,
): void {
  if (!agent) {
    return;
  }

  setAgentPlanMarkdown(agent, threadId, turnId, payload.markdown, updatedAt, 'completed');
}

export function setAgentPlanMarkdown(agent: Agent, threadId: string, turnId: string, markdown: string, updatedAt: string, status: ThreadPlan['status'], options: { trim?: boolean } = {}): void {
  const content = markdown.trim();
  if (!content) {
    return;
  }
  const nextMarkdown = options.trim === false ? markdown : content;

  if (
    agent.plan?.turnId === turnId &&
    agent.plan.kind === 'proposed' &&
    agent.plan.status === status &&
    agent.plan.markdown === nextMarkdown
  ) {
    return;
  }

  agent.plan = {
    threadId,
    turnId,
    kind: 'proposed',
    status,
    explanation: '',
    steps: [],
    markdown: nextMarkdown,
    updatedAt,
  };
}

export function appendAssistantDeltaWithPlanFilter(
  snapshot: AppSnapshot,
  agentId: string,
  agent: Agent | undefined,
  threadId: string | undefined,
  turnId: string,
  delta: string,
  itemId: string | undefined,
  updatedAt: string,
  phase?: 'commentary' | 'final_answer',
): void {
  if (!delta) {
    return;
  }

  if (!threadId) {
    appendAssistantDelta(snapshot, agentId, turnId, delta, updatedAt, itemId, phase);
    return;
  }

  if (!agent) {
    appendAssistantDelta(snapshot, agentId, turnId, delta, updatedAt, itemId, phase);
    return;
  }

  let remaining = delta;
  let capturing = isCapturingProposedPlan(snapshot, agentId, turnId);
  const operation = planProgressOperation(agent, turnId);

  while (remaining) {
    if (capturing) {
      const closeIndex = lowerIndexOf(remaining, '</proposed_plan>');
      const planDelta = closeIndex >= 0 ? remaining.slice(0, closeIndex) : remaining;
      if (planDelta) {
        appendAgentPlanMarkdownText(agent, threadId, turnId, planDelta, updatedAt);
      }
      if (closeIndex >= 0 && agent.plan?.turnId === turnId) {
        setAgentPlanMarkdown(agent, threadId, turnId, agent.plan.markdown, updatedAt, 'completed');
      }
      if (agent.plan?.turnId === turnId) {
        upsertPlanProgressToolPart(
          snapshot,
          agentId,
          turnId,
          agent.plan.markdown,
          closeIndex >= 0 ? 'completed' : 'running',
          operation,
          updatedAt,
          closeIndex < 0,
        );
      }

      if (closeIndex < 0) {
        return;
      }

      remaining = remaining.slice(closeIndex + '</proposed_plan>'.length);
      capturing = false;
      continue;
    }

    const openIndex = lowerIndexOf(remaining, '<proposed_plan>');
    if (openIndex < 0) {
      appendAssistantDelta(snapshot, agentId, turnId, remaining, updatedAt, itemId, phase);
      return;
    }

    const visibleDelta = remaining.slice(0, openIndex);
    if (visibleDelta) {
      appendAssistantDelta(snapshot, agentId, turnId, visibleDelta, updatedAt, itemId, phase);
    }

    remaining = remaining.slice(openIndex + '<proposed_plan>'.length);
    capturing = true;
    upsertPlanProgressToolPart(
      snapshot,
      agentId,
      turnId,
      agent.plan?.turnId === turnId ? agent.plan.markdown : '',
      'running',
      operation,
      updatedAt,
      true,
    );
  }
}

export function appendAgentPlanMarkdownText(agent: Agent, threadId: string, turnId: string, delta: string, updatedAt: string): void {
  const existingMarkdown = agent.plan?.turnId === turnId ? agent.plan.markdown : '';
  setAgentPlanMarkdown(agent, threadId, turnId, `${existingMarkdown}${delta}`, updatedAt, 'inProgress', { trim: false });
}

export function lowerIndexOf(value: string, search: string): number {
  return value.toLowerCase().indexOf(search.toLowerCase());
}

export function planProgressOperation(agent: Agent, turnId: string): 'update' | 'write' {
  return agent.plan && agent.plan.turnId !== turnId ? 'update' : 'write';
}

export function isCapturingProposedPlan(snapshot: AppSnapshot, agentId: string, turnId: string): boolean {
  return Boolean(planProgressToolPart(snapshot, agentId, turnId)?.metadata?.capturingProposedPlan);
}

export function planProgressToolPart(snapshot: AppSnapshot, agentId: string, turnId: string): ToolPart | undefined {
  const message = findAssistantMessageWithToolPart(snapshot, agentId, turnId, planProgressToolPartId(turnId));
  return message?.parts.find((part): part is ToolPart => part.type === 'tool' && part.id === planProgressToolPartId(turnId));
}

export function upsertPlanProgressToolPart(
  snapshot: AppSnapshot,
  agentId: string,
  turnId: string,
  markdown: string,
  status: ToolPart['status'],
  operation: 'update' | 'write',
  createdAt: string,
  capturingProposedPlan = false,
): void {
  upsertAssistantToolPart(snapshot, agentId, turnId, {
    type: 'tool',
    id: planProgressToolPartId(turnId),
    kind: 'generic',
    title: 'plan',
    status,
    statusText: JSON.stringify({
      source: 'codex',
      action: 'plan',
      phase: status,
      params: {
        addedLines: planLineCount(markdown),
        operation,
        target: 'plan',
      },
    }),
    metadata: {
      capturingProposedPlan,
      planProgress: true,
    },
  }, createdAt);
}

export function planProgressToolPartId(turnId: string): string {
  return `plan-${turnId}`;
}

export function planLineCount(markdown: string): number {
  return markdown.split(/\r?\n/).filter((line) => line.trim()).length;
}

type ConversationEventPayload<Type extends SnapshotEventOwnedBy<'conversation'>['type']> =
  Extract<SnapshotEventOwnedBy<'conversation'>, { type: Type }>['payload'];
