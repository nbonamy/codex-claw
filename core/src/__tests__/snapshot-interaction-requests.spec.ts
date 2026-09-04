import { describe, expect, it } from 'vitest';
import {
  createInitialSnapshot,
} from '../snapshot';
import { applyConversationEventToSnapshot as applyMainEventToSnapshot } from '../snapshot-conversation-reducer';
import type {
  BackendApprovalRequest,
  MainToRendererEvent,
  RendererToolPart,
  RendererToolPartUpdate,
} from '../contracts';
import {
  commandOutputDeltaToToolPartUpdate,
  commandToolPart,
  dynamicToolPart,
  fileChangePatchToToolPartUpdate,
  fileChangeToolPart,
  mcpProgressToToolPartUpdate,
  mcpToolPart,
  rawOutputToToolPartUpdate,
  toolPartPayload,
} from './snapshot-test-fixtures';

describe('snapshot reducer', () => {

  it('keeps queued prompts in the authoritative snapshot until confirmed dequeue', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.promptQueued',
      payload: { id: 'prompt-1', text: 'run next', options: { planMode: true } },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      type: 'agent.promptQueued',
      payload: { id: 'prompt-1', text: 'run next' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.queuedPrompts).toStrictEqual([{
      id: 'prompt-1',
      agentId: 'agent-dina',
      text: 'run next',
      createdAt: '2026-06-05T00:00:01.000Z',
      options: { planMode: true },
    }]);

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      type: 'agent.promptDequeued',
      payload: { ids: ['prompt-1'] },
      occurredAt: '2026-06-05T00:00:03.000Z',
    });
    expect(snapshot.queuedPrompts).toStrictEqual([]);
  });

  it('keeps queued prompts in snapshot state and scopes dequeue to the owning agent', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1, agentId: 'agent-dina', type: 'agent.promptQueued',
      payload: { id: 'shared-id', text: 'Dina next' }, occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2, agentId: 'agent-jesse', type: 'agent.promptQueued',
      payload: { id: 'shared-id', text: 'Jesse next' }, occurredAt: '2026-06-05T00:00:02.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 3, agentId: 'agent-dina', type: 'agent.promptDequeued',
      payload: { ids: ['shared-id'] }, occurredAt: '2026-06-05T00:00:03.000Z',
    });

    expect(snapshot.queuedPrompts).toStrictEqual([{
      id: 'shared-id', agentId: 'agent-jesse', text: 'Jesse next', createdAt: '2026-06-05T00:00:02.000Z',
    }]);
  });

  it('records queue retry failures without removing or reordering the prompt', () => {
    const snapshot = createInitialSnapshot();
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      type: 'agent.promptQueued',
      payload: { id: 'prompt-1', text: 'retry me' },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      type: 'agent.promptRetryScheduled',
      payload: {
        id: 'prompt-1',
        attempts: 2,
        lastError: 'transport disconnected',
        retryAt: '2026-06-05T00:00:03.000Z',
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.queuedPrompts).toStrictEqual([{
      id: 'prompt-1',
      agentId: 'agent-dina',
      text: 'retry me',
      createdAt: '2026-06-05T00:00:01.000Z',
      attempts: 2,
      lastError: 'transport disconnected',
      retryAt: '2026-06-05T00:00:03.000Z',
      submitted: true,
    }]);
  });

  it('keeps backend approvals in canonical snapshot state until resolution', () => {
    const snapshot = createInitialSnapshot();
    const approval = {
      id: 'approval-1',
      kind: 'command' as const,
      conversationId: 'thread-dina',
      itemId: 'command-1',
      title: 'Run tests',
      command: 'npm test',
    };
    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      type: 'backendApproval.requested',
      payload: { approval },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.backendApprovals['agent-dina']).toStrictEqual([approval]);
    expect(snapshot.agents[0]?.status).toStrictEqual({ type: 'awaitingInput', detail: 'Run tests' });

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-dina',
      type: 'backendApproval.resolved',
      payload: { approval, decision: 'approve', scope: 'once', reason: 'host' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });
    expect(snapshot.backendApprovals['agent-dina']).toStrictEqual([]);
  });

  it('attaches approval requests to the matching running MCP tool part', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(mcpToolPart({
        id: 'call-register-agent',
        title: 'codex_claw.register-agent',
        status: 'running',
        input: { agentId: 'agent-dina' },
        metadata: {
          server: 'codex_claw',
          tool: 'register-agent',
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'approval.requested',
      payload: {
        id: 'approval-1',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            allowAlways: true,
            allowConversation: true,
            argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
            integrationId: 'codex_claw',
            integrationName: 'codex_claw',
            summary: 'Allow codex_claw to run register-agent?',
            toolName: 'register-agent',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    const tool = snapshot.messages.at(-1)?.parts[0];
    expect(tool).toMatchObject({
      type: 'tool',
      id: 'call-register-agent',
      kind: 'mcp',
      title: 'codex_claw.register-agent',
      status: 'running',
      input: { agentId: 'agent-dina' },
      metadata: {
        confirmationRequestId: 'approval-1',
        server: 'codex_claw',
        tool: 'register-agent',
      },
    });
    expect(tool?.type === 'tool' ? JSON.parse(tool.statusText ?? '') : null).toStrictEqual({
      source: 'mcp',
      action: 'run',
      phase: 'running',
      params: {
        requestId: 'approval-1',
        tool: 'codex_claw.register-agent',
        confirmationSummary: 'Allow codex_claw to run register-agent?',
        argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
        allowConversation: true,
        allowAlways: true,
      },
    });
    expect(snapshot.agents[0].status).toStrictEqual({
      type: 'awaitingInput',
      detail: 'Allow codex_claw to run register-agent?',
    });
  });

  it('creates an inline approval placeholder if the MCP tool item has not arrived yet', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'approval.requested',
      payload: {
        id: 'approval-early',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            argumentsPreview: 'agentId: agent-dina',
            integrationId: 'codex_claw',
            integrationName: 'codex_claw',
            summary: 'Allow codex_claw to register this agent?',
            toolName: 'register-agent',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'approval-approval-early',
        kind: 'mcp',
        title: 'codex_claw.register-agent',
        status: 'running',
        statusText: JSON.stringify({
          source: 'mcp',
          action: 'run',
          phase: 'running',
          params: {
            requestId: 'approval-early',
            tool: 'codex_claw.register-agent',
            confirmationSummary: 'Allow codex_claw to register this agent?',
            argumentsPreview: 'agentId: agent-dina',
            allowConversation: false,
            allowAlways: false,
          },
        }),
        input: 'agentId: agent-dina',
        metadata: {
          confirmationRequestId: 'approval-early',
          server: 'codex_claw',
          tool: 'register-agent',
        },
      },
    ]);
  });

  it('creates an inline user-input prompt from app-server tool input requests', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'toolInput.requested',
      payload: {
        id: 'ask-1',
        kind: 'ask_user',
        payload: {
          request: {
            itemId: 'ask-user-item',
            questions: [
              {
                id: 'target_file',
                header: 'Target',
                question: 'Which file should I inspect?',
                isOther: true,
                isSecret: false,
                options: null,
              },
            ],
          },
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toStrictEqual([
      {
        type: 'tool',
        id: 'ask-user-item',
        kind: 'generic',
        title: 'ask_user_question',
        status: 'running',
        statusText: JSON.stringify({
          source: 'codex',
          action: 'ask_user_question',
          phase: 'running',
          params: {
            requestId: 'ask-1',
            questions: [
              {
                id: 'target_file',
                header: 'Target',
                question: 'Which file should I inspect?',
                isOther: true,
                isSecret: false,
                options: null,
              },
            ],
          },
        }),
        input: [
          {
            id: 'target_file',
            header: 'Target',
            question: 'Which file should I inspect?',
            isOther: true,
            isSecret: false,
            options: null,
          },
        ],
        metadata: {
          requestId: 'ask-1',
          question: 'Which file should I inspect?',
        },
      },
    ]);
    expect(snapshot.agents[0].status).toStrictEqual({
      type: 'awaitingInput',
      detail: 'Which file should I inspect?',
    });
  });

  it('attaches approval requests to the only running MCP tool when metadata is incomplete', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'item.started',
      payload: toolPartPayload(mcpToolPart({
        id: 'call-without-metadata',
        title: 'unknown_server.unknown-tool',
        status: 'running',
        metadata: {
          server: 'unknown_server',
          tool: 'unknown-tool',
        },
      })),
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'approval.requested',
      payload: {
        id: 'approval-sole-tool',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
            integrationId: 'codex_claw',
            integrationName: 'codex_claw',
            summary: 'Allow codex_claw to register this agent?',
            toolName: 'register-agent',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages.at(-1)?.parts).toHaveLength(1);
    expect(snapshot.messages.at(-1)?.parts[0]).toMatchObject({
      type: 'tool',
      id: 'call-without-metadata',
      title: 'codex_claw.register-agent',
      metadata: {
        confirmationRequestId: 'approval-sole-tool',
        server: 'codex_claw',
        tool: 'register-agent',
      },
    });
  });

  it('keeps conversation-scoped Codex approval and input requests invisible without a turn', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      type: 'approval.requested',
      payload: {
        id: 'approval-without-turn',
        kind: 'confirm_tool',
        payload: {
          confirmation: {
            argumentsPreview: 'npm test',
            integrationId: 'shell',
            integrationName: 'Shell',
            summary: 'Run tests?',
            toolName: 'exec',
          },
        },
      },
      occurredAt: '2026-06-05T00:00:01.000Z',
    });
    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      type: 'toolInput.requested',
      payload: {
        id: 'input-without-turn',
        kind: 'ask_user',
        payload: { request: { itemId: 'ask-1', questions: [] } },
      },
      occurredAt: '2026-06-05T00:00:02.000Z',
    });

    expect(snapshot.messages).toStrictEqual([]);
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'idle' });
  });

  it('preserves malformed approval and input status fallbacks', () => {
    const snapshot = createInitialSnapshot();

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      type: 'backendApproval.requested',
      payload: {},
      occurredAt: '2026-06-05T00:00:01.000Z',
    } as unknown as MainToRendererEvent);
    expect(snapshot.backendApprovals).toStrictEqual({});
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'idle' });

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'approval.requested',
      payload: {},
      occurredAt: '2026-06-05T00:00:02.000Z',
    } as unknown as MainToRendererEvent);
    expect(snapshot.messages).toStrictEqual([]);
    expect(snapshot.agents[0].status).toStrictEqual({ type: 'awaitingInput', detail: undefined });

    applyMainEventToSnapshot(snapshot, {
      seq: 3,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      turnId: 'turn-1',
      type: 'toolInput.requested',
      payload: {},
      occurredAt: '2026-06-05T00:00:03.000Z',
    } as unknown as MainToRendererEvent);
    expect(snapshot.messages).toStrictEqual([]);
    expect(snapshot.agents[0].status).toStrictEqual({
      type: 'awaitingInput',
      detail: 'Waiting for user input',
    });
  });

  it('retains flat approval parsing and leaves agent-less global resolution dormant', () => {
    const snapshot = createInitialSnapshot();
    const approval: BackendApprovalRequest = {
      id: 'approval-flat',
      kind: 'command',
      conversationId: 'thread-1',
      itemId: 'command-1',
      title: 'Run tests',
    };

    applyMainEventToSnapshot(snapshot, {
      seq: 1,
      agentId: 'agent-dina',
      backend: 'codex',
      threadId: 'thread-1',
      type: 'backendApproval.requested',
      payload: approval,
      occurredAt: '2026-06-05T00:00:01.000Z',
    } as unknown as MainToRendererEvent);
    snapshot.backendApprovals['agent-jesse'] = [approval];

    applyMainEventToSnapshot(snapshot, {
      seq: 2,
      type: 'backendApproval.resolved',
      payload: { approval, decision: null, scope: null, reason: 'server' },
      occurredAt: '2026-06-05T00:00:02.000Z',
    } as unknown as MainToRendererEvent);

    expect(snapshot.backendApprovals['agent-dina']).toStrictEqual([approval]);
    expect(snapshot.backendApprovals['agent-jesse']).toStrictEqual([approval]);
  });
});
