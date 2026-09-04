import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AgentBackend,
  AgentFileActivity,
  AgentGitStatus,
  BackendConnectionState,
  BrowserAnnotation,
  ClientState,
  RendererMessage,
  RendererToolPart,
  RendererToolPartUpdate,
  SubagentStatusChange,
  TurnGitDiff,
} from '../contracts';
import { createInitialSnapshot } from '../snapshot';
import { isClawSnapshotGetResult, type ClawBackendEvent } from '../backend-protocol/rpc';
import { isAppSnapshot, isClientState } from '../snapshot-guards';

describe('backend protocol guards', () => {
  it('recognizes complete snapshot/get results from clawd', () => {
    expect(isClawSnapshotGetResult({
      snapshot: createInitialSnapshot(),
      lastEventSeq: 17,
      clientState: {
        sourceFolderPath: '/Users/nbonamy/src',
        shouldPreventDisplaySleep: true,
        shouldPreventDisplaySleepForRemoteAccess: false,
      },
    })).toBe(true);
  });

  it('rejects partial objects that only resemble snapshots', () => {
    expect(isAppSnapshot({
      teams: [],
      agents: [],
    })).toBe(false);
    expect(isClawSnapshotGetResult({
      snapshot: {
        teams: [],
        agents: [],
      },
      lastEventSeq: 17,
      clientState: {
        sourceFolderPath: '/Users/nbonamy/src',
        shouldPreventDisplaySleep: false,
      },
    })).toBe(false);
  });

  it('requires backend-derived client state in snapshot/get results', () => {
    expect(isClientState({
      sourceFolderPath: '/Users/nbonamy/src',
      shouldPreventDisplaySleep: false,
      shouldPreventDisplaySleepForRemoteAccess: true,
    })).toBe(true);
    expect(isClientState({
      sourceFolderPath: '/Users/nbonamy/src',
      shouldPreventDisplaySleep: false,
      shouldPreventDisplaySleepForRemoteAccess: 'yes',
    })).toBe(false);
    expect(isClawSnapshotGetResult({
      snapshot: createInitialSnapshot(),
      lastEventSeq: 17,
    })).toBe(false);
  });

  it('preserves typed payloads through the clawd event envelope', () => {
    type AnnotationEvent = Extract<ClawBackendEvent, { type: 'browser.annotationCreated' }>;

    expectTypeOf<Extract<ClawBackendEvent, { type: 'client.connectionChanged' }>['payload']>()
      .toEqualTypeOf<BackendConnectionState>();
    expectTypeOf<AnnotationEvent['payload']>().toEqualTypeOf<BrowserAnnotation>();
    type SubagentStatusEvent = Extract<ClawBackendEvent, { type: 'subagent.statusChanged' }>;
    expectTypeOf<SubagentStatusEvent['payload']>().toEqualTypeOf<SubagentStatusChange>();
    expectTypeOf<Pick<SubagentStatusEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{
        agentId: string;
        backend: 'codex' | 'claude';
        threadId: string;
        turnId?: string;
      }>();
    type MessageDeltaEvent = Extract<ClawBackendEvent, { type: 'message.delta' }>;
    expectTypeOf<MessageDeltaEvent['payload']>().toEqualTypeOf<{
      delta: string;
      messageId?: string;
      itemId?: string;
      phase?: 'commentary' | 'final_answer';
    }>();
    expectTypeOf<Pick<MessageDeltaEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{
        agentId: string;
        backend: AgentBackend;
        threadId?: string;
        turnId: string;
      }>();
    expectTypeOf<Extract<ClawBackendEvent, { type: 'thread.historyLoaded' }>['payload']>()
      .toEqualTypeOf<{
        messages: RendererMessage[];
        replace?: boolean;
        preserveKnownTurns?: boolean;
        preserveKnownMessages?: boolean;
        hasOlderMessages?: boolean;
      }>();
    type ItemStartedEvent = Extract<ClawBackendEvent, { type: 'item.started' }>;
    expectTypeOf<ItemStartedEvent['payload']>()
      .toEqualTypeOf<{ messageId?: string; toolPart: RendererToolPart }>();
    expectTypeOf<Extract<ClawBackendEvent, { type: 'item.updated' }>['payload']>()
      .toEqualTypeOf<RendererToolPartUpdate & { messageId?: string }>();
    expectTypeOf<Extract<ClawBackendEvent, { type: 'item.completed' }>['payload']>()
      .toEqualTypeOf<{ messageId?: string; toolPart: RendererToolPart }>();
    expectTypeOf<Pick<ItemStartedEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{ agentId: string; backend: AgentBackend; threadId?: string; turnId: string }>();
    type DiffUpdatedEvent = Extract<ClawBackendEvent, { type: 'diff.updated' }>;
    expectTypeOf<DiffUpdatedEvent['payload']>()
      .toEqualTypeOf<Omit<TurnGitDiff, 'turnId' | 'updatedAt'>>();
    expectTypeOf<Pick<DiffUpdatedEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{ agentId: string; backend: AgentBackend; threadId: string; turnId: string }>();
    expectTypeOf<Extract<ClawBackendEvent, { type: 'file.activity' }>['payload']>()
      .toEqualTypeOf<Omit<AgentFileActivity, 'agentId' | 'turnId' | 'occurredAt'>>();
    type GitStatusUpdatedEvent = Extract<ClawBackendEvent, { type: 'git.statusUpdated' }>;
    expectTypeOf<GitStatusUpdatedEvent['payload']>().toEqualTypeOf<AgentGitStatus>();
    expectTypeOf<Pick<GitStatusUpdatedEvent, 'agentId' | 'backend' | 'threadId' | 'turnId'>>()
      .toEqualTypeOf<{ agentId: string; backend?: AgentBackend; threadId?: string; turnId?: string }>();
    expectTypeOf<AnnotationEvent['seq']>().toEqualTypeOf<number>();
    expectTypeOf<AnnotationEvent['occurredAt']>().toEqualTypeOf<string>();
    expectTypeOf<AnnotationEvent['clientState']>().toEqualTypeOf<ClientState | undefined>();
  });
});
