import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  Agent,
  AgentFileActivity,
  AgentGitStatus,
  AppSnapshotMetadata,
  BackendApprovalDecision,
  BackendApprovalRequest,
  BackendApprovalScope,
  BackendConnectionState,
  BrowserAnnotation,
  ClientRequest,
  RendererMessage,
  RendererToolPart,
  RendererToolPartUpdate,
  SendPromptOptions,
  SubagentOperationChange,
  TurnGitDiff,
} from '../contracts';
import { createEmptySnapshot } from '../snapshot';
import {
  backendDisplayName,
  backendRuntimeFromSnapshot,
  codexPromptOptions,
  unsupportedBackendFeature,
  type BackendEvent,
} from '../backend-driver';

describe('backend driver helpers', () => {
  it('uses product-facing backend names in unsupported feature errors', () => {
    expect(backendDisplayName('codex')).toBe('Codex');
    expect(backendDisplayName('claude')).toBe('Claude');
    expect(unsupportedBackendFeature(agent('claude'), 'rollback').message)
      .toBe('Claude does not support rollback.');
  });

  it('finds a runtime in a snapshot and supplies a safe fallback', () => {
    const snapshot = createEmptySnapshot();
    snapshot.backendRuntimes = [{ backend: 'codex', status: 'running' }];

    expect(backendRuntimeFromSnapshot(snapshot, 'codex')).toStrictEqual({
      backend: 'codex',
      status: 'running',
    });
    expect(backendRuntimeFromSnapshot(snapshot, 'claude')).toStrictEqual({
      backend: 'claude',
      status: 'notConfigured',
    });
  });

  it('extracts only Codex prompt options', () => {
    const codexOptions = {
      backendOptions: {
        kind: 'codex',
        model: 'gpt-5',
      },
    } as SendPromptOptions;
    const claudeOptions = {
      backendOptions: {
        kind: 'claude',
      },
    } as SendPromptOptions;

    expect(codexPromptOptions(codexOptions)).toBe(codexOptions.backendOptions);
    expect(codexPromptOptions(claudeOptions)).toBeUndefined();
    expect(codexPromptOptions(undefined)).toBeUndefined();
  });

  it('preserves typed payloads through the backend event input envelope', () => {
    type ConnectionEvent = Extract<BackendEvent, { type: 'client.connectionChanged' }>;

    expectTypeOf<ConnectionEvent['payload']>()
      .toEqualTypeOf<BackendConnectionState>();
    expectTypeOf<Extract<BackendEvent, { type: 'snapshot.updated' }>['payload']>()
      .toEqualTypeOf<AppSnapshotMetadata>();
    expectTypeOf<Extract<BackendEvent, { type: 'browser.annotationCreated' }>['payload']>()
      .toEqualTypeOf<BrowserAnnotation>();
    type SubagentOperationEvent = Extract<BackendEvent, { type: 'subagent.operationChanged' }>;
    expectTypeOf<SubagentOperationEvent['payload']>().toEqualTypeOf<SubagentOperationChange>();
    expectTypeOf<Pick<SubagentOperationEvent, 'agentId' | 'backend' | 'threadId' | 'turnId' | 'source'>>()
      .toEqualTypeOf<{
        agentId: string;
        backend: Agent['backend'];
        threadId: string;
        turnId?: string;
        source?: 'backend' | 'client';
      }>();
    type MessageDeltaEvent = Extract<BackendEvent, { type: 'message.delta' }>;
    expectTypeOf<MessageDeltaEvent['payload']>().toEqualTypeOf<{
      delta: string;
      messageId?: string;
      itemId?: string;
      phase?: 'commentary' | 'final_answer';
    }>();
    expectTypeOf<Pick<MessageDeltaEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{
        agentId: string;
        backend: Agent['backend'];
        threadId?: string;
        turnId: string;
      }>();
    expectTypeOf<Extract<BackendEvent, { type: 'thread.historyLoaded' }>['payload']>()
      .toEqualTypeOf<{
        messages: RendererMessage[];
        replace?: boolean;
        preserveKnownTurns?: boolean;
        preserveKnownMessages?: boolean;
        hasOlderMessages?: boolean;
      }>();
    type ItemStartedEvent = Extract<BackendEvent, { type: 'item.started' }>;
    type ItemUpdatedEvent = Extract<BackendEvent, { type: 'item.updated' }>;
    expectTypeOf<ItemStartedEvent['payload']>()
      .toEqualTypeOf<{ messageId?: string; toolPart: RendererToolPart }>();
    expectTypeOf<ItemUpdatedEvent['payload']>()
      .toEqualTypeOf<RendererToolPartUpdate & { messageId?: string }>();
    expectTypeOf<Extract<BackendEvent, { type: 'item.completed' }>['payload']>()
      .toEqualTypeOf<{ messageId?: string; toolPart: RendererToolPart }>();
    expectTypeOf<Pick<ItemStartedEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{ agentId: string; backend: Agent['backend']; threadId?: string; turnId: string }>();
    type DiffUpdatedEvent = Extract<BackendEvent, { type: 'diff.updated' }>;
    expectTypeOf<DiffUpdatedEvent['payload']>()
      .toEqualTypeOf<Omit<TurnGitDiff, 'turnId' | 'updatedAt'>>();
    expectTypeOf<Pick<DiffUpdatedEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{ agentId: string; backend: Agent['backend']; threadId: string; turnId: string }>();
    expectTypeOf<Extract<BackendEvent, { type: 'file.activity' }>['payload']>()
      .toEqualTypeOf<Omit<AgentFileActivity, 'agentId' | 'turnId' | 'occurredAt'>>();
    type GitStatusUpdatedEvent = Extract<BackendEvent, { type: 'git.statusUpdated' }>;
    expectTypeOf<GitStatusUpdatedEvent['payload']>().toEqualTypeOf<AgentGitStatus>();
    expectTypeOf<Pick<GitStatusUpdatedEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{ agentId: string; backend?: Agent['backend']; threadId?: string; turnId?: string }>();
    type ApprovalRequestedEvent = Extract<BackendEvent, { type: 'approval.requested' }>;
    type CodexApprovalRequestedEvent = Extract<ApprovalRequestedEvent, { backend: 'codex' }>;
    type ClaudeApprovalRequestedEvent = Extract<ApprovalRequestedEvent, { backend: 'claude' }>;
    expectTypeOf<ApprovalRequestedEvent['payload']>()
      .toEqualTypeOf<Extract<ClientRequest, { kind: 'confirm_tool' }>>();
    expectTypeOf<Pick<CodexApprovalRequestedEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{ agentId: string; backend: 'codex'; threadId: string; turnId?: string }>();
    expectTypeOf<Pick<ClaudeApprovalRequestedEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{ agentId: string; backend: 'claude'; threadId?: string; turnId: string }>();
    expectTypeOf<Extract<BackendEvent, { type: 'toolInput.requested' }>['payload']>()
      .toEqualTypeOf<Extract<ClientRequest, { kind: 'ask_user' }>>();
    expectTypeOf<Extract<BackendEvent, { type: 'backendApproval.requested' }>['payload']>()
      .toEqualTypeOf<{ approval: BackendApprovalRequest }>();
    expectTypeOf<Extract<BackendEvent, { type: 'backendApproval.resolved' }>['payload']>()
      .toEqualTypeOf<{
        approval: BackendApprovalRequest;
        decision: BackendApprovalDecision | null;
        scope: BackendApprovalScope | null;
        reason: 'host' | 'server' | 'conversation_closed' | 'conversation_removed' | 'surface_disconnected';
      }>();
    type ErrorEvent = Extract<BackendEvent, { type: 'error' }>;
    expectTypeOf<ErrorEvent['payload']>()
      .toEqualTypeOf<{ message: string; willRetry?: boolean; error?: unknown }>();
    expectTypeOf<Pick<ErrorEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{ agentId: string; backend?: Agent['backend']; threadId?: string; turnId?: string }>();
    expectTypeOf<ConnectionEvent['seq']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<ConnectionEvent['occurredAt']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<ConnectionEvent['source']>().toEqualTypeOf<'backend' | 'client' | undefined>();
  });
});

function agent(backend: Agent['backend']): Agent {
  return {
    id: 'agent-dina',
    teamId: 'team-claw',
    name: 'Dina',
    avatar: 'DI',
    folder: '/tmp/claw',
    backend,
    backendDefaults: backend === 'codex' ? { kind: 'codex' } : { kind: 'claude' },
    status: { type: 'idle' },
    createdAt: '2026-08-02T00:00:00.000Z',
    updatedAt: '2026-08-02T00:00:00.000Z',
  };
}
