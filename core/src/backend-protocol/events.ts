import type { ClientState, MainToRendererEvent } from '../contracts';
import { isClientState, isAppSnapshot } from '../snapshot-guards';
import { agentPayloadValidators } from './event-agent-payloads';
import { conversationPayloadValidators } from './event-conversation-payloads';
import { runtimePayloadValidators } from './event-runtime-payloads';
import {
  expectKnownShape,
  expectLiteral,
  expectOptional,
  expectRecord,
  expectString,
  expectNumber,
  failEventValidation,
  type EventValueValidator,
} from './event-validation';

type ClawBackendEventFrom<Event extends MainToRendererEvent> = Event extends MainToRendererEvent
  ? Omit<Event, 'source'> & { clientState?: ClientState }
  : never;

export type ClawBackendEvent = ClawBackendEventFrom<MainToRendererEvent>;

type ClawBackendEventType = ClawBackendEvent['type'];

const payloadValidators = {
  ...runtimePayloadValidators,
  ...agentPayloadValidators,
  ...conversationPayloadValidators,
} satisfies Record<ClawBackendEventType, EventValueValidator>;

type EventRecord = Record<string, unknown> & { type: ClawBackendEventType };

function expectRequiredString(
  event: Record<string, unknown>,
  key: string,
): void {
  expectString(event[key], `$.${key}`);
}

function expectRequiredBackend(
  event: Record<string, unknown>,
  backend?: 'codex' | 'claude',
): void {
  expectLiteral(
    event.backend,
    backend ? [backend] : ['codex', 'claude'],
    '$.backend',
  );
}

function expectAgent(event: Record<string, unknown>): void {
  expectRequiredString(event, 'agentId');
}

function expectAgentBackend(
  event: Record<string, unknown>,
  backend?: 'codex' | 'claude',
): void {
  expectAgent(event);
  expectRequiredBackend(event, backend);
}

function expectTurnContext(
  event: Record<string, unknown>,
  threadRequired: boolean,
): void {
  expectAgentBackend(event);
  expectRequiredString(event, 'turnId');
  if (threadRequired) expectRequiredString(event, 'threadId');
}

function expectEventContext(event: EventRecord): void {
  switch (event.type) {
    case 'backend.statusChanged':
    case 'account.rateLimitsUpdated':
    case 'models.changed':
    case 'skills.changed':
      expectRequiredBackend(event);
      return;
    case 'sidePanel.markdownRequested':
    case 'sidePanel.gitDiffRequested':
    case 'celebration.requested':
    case 'agentCreation.progress':
    case 'git.operationProgress':
    case 'agent.updated':
    case 'agent.statusChanged':
    case 'thread.goalCleared':
    case 'thread.historyLoaded':
    case 'message.userSubmitted':
    case 'message.steer':
    case 'agent.promptQueued':
    case 'agent.promptRetryScheduled':
    case 'agent.promptDequeued':
    case 'git.statusUpdated':
    case 'error':
      expectAgent(event);
      return;
    case 'clientRequest.resolved':
      expectAgentBackend(event);
      return;
    case 'thread.started':
      expectAgentBackend(event);
      if (event.backend === 'codex') {
        expectRequiredString(event, 'threadId');
        const payload = event.payload as Record<string, unknown>;
        if (
          payload.sessionId !== undefined ||
          payload.transport !== undefined
        ) {
          failEventValidation(
            '$.payload',
            'expected Codex thread start payload',
          );
        }
      } else {
        expectRequiredString(event, 'backendSessionId');
        const payload = event.payload as Record<string, unknown>;
        if (
          payload.sessionId === undefined ||
          payload.transport === undefined
        ) {
          failEventValidation(
            '$.payload',
            'expected Claude thread start payload',
          );
        }
      }
      return;
    case 'thread.settingsUpdated':
      expectAgentBackend(event, 'codex');
      expectRequiredString(event, 'threadId');
      return;
    case 'thread.modeUpdated':
      expectAgentBackend(event);
      if (event.backend === 'codex') {
        expectRequiredString(event, 'threadId');
      } else {
        expectRequiredString(event, 'turnId');
        const payload = event.payload as Record<string, unknown>;
        expectLiteral(payload.provider, ['claude'], '$.payload.provider');
        expectString(payload.permissionMode, '$.payload.permissionMode');
      }
      return;
    case 'thread.goalUpdated':
      expectAgent(event);
      expectRequiredString(event, 'threadId');
      return;
    case 'thread.tokenUsageUpdated':
    case 'subagent.operationChanged':
    case 'subagent.activityChanged':
    case 'subagent.identityChanged':
    case 'subagent.statusChanged':
      expectAgentBackend(event);
      expectRequiredString(event, 'threadId');
      return;
    case 'turn.planUpdated':
    case 'turn.proposedPlanDelta':
    case 'turn.proposedPlanCompleted':
    case 'message.updated':
    case 'diff.updated':
    case 'file.activity':
      expectTurnContext(event, true);
      return;
    case 'turn.started':
    case 'turn.completed':
    case 'context.compactionStarted':
    case 'context.compactionCompleted':
    case 'message.delta':
    case 'item.started':
    case 'item.updated':
    case 'item.completed':
      expectTurnContext(event, false);
      return;
    case 'approval.requested':
    case 'toolInput.requested':
      expectAgentBackend(event);
      if (event.backend === 'codex') expectRequiredString(event, 'threadId');
      else expectRequiredString(event, 'turnId');
      return;
    case 'backendApproval.requested':
    case 'backendApproval.resolved':
      expectAgentBackend(event, 'codex');
      expectRequiredString(event, 'threadId');
      return;
    case 'client.connectionChanged':
    case 'snapshot.updated':
    case 'devicePairing.statusChanged':
    case 'browser.annotationCreated':
    case 'workBacklog.assignmentUpdated':
    case 'workRouting.requested':
    case 'workRouting.resolved':
      return;
  }
}

export function decodeClawBackendEvent(value: unknown): ClawBackendEvent {
  expectRecord(value, '$');
  expectNumber(value.seq, '$.seq');
  expectString(value.occurredAt, '$.occurredAt');
  if (typeof value.type !== 'string' || !(value.type in payloadValidators)) {
    failEventValidation('$.type', 'expected a supported event type');
  }
  const event = value as EventRecord;
  expectOptional(event, 'agentId', '$', expectString);
  expectOptional(event, 'backend', '$', (candidate, path) =>
    expectLiteral(candidate, ['codex', 'claude'], path),
  );
  expectOptional(event, 'backendSessionId', '$', expectString);
  expectOptional(event, 'threadId', '$', expectString);
  expectOptional(event, 'turnId', '$', expectString);
  expectOptional(event, 'snapshot', '$', (candidate, path) => {
    expectKnownShape(
      candidate,
      path,
      isAppSnapshot,
      'full application snapshot',
    );
  });
  expectOptional(event, 'clientState', '$', (candidate, path) => {
    expectKnownShape(candidate, path, isClientState, 'client state');
  });
  payloadValidators[event.type](event.payload, '$.payload');
  expectEventContext(event);
  return value as ClawBackendEvent;
}
