import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import type { AgentBackendDriver } from '@codex-claw/core/backend-driver';
import type { Agent } from '@codex-claw/core/contracts';
import { BackendDriverRpc } from '../driver-rpc';
import { ClawBackendServer } from '../server';
import { createTestSnapshot } from './server-test-fixtures';
import type { ReviewToolHandlers } from '../review/review-tool-registry';

describe('ClawBackendServer code review workflow', () => {
  it('owns readiness, arbitration, same-thread remediation, review again, and finish', async () => {
    const snapshot = createTestSnapshot();
    const owner: Agent = {
      id: 'agent-owner',
      teamId: snapshot.teams[0]!.id,
      name: 'Owner',
      folder: '/repo',
      backend: 'codex' as const,
      status: { type: 'idle' as const },
      createdAt: '2026-09-19T10:00:00.000Z',
      updatedAt: '2026-09-19T10:00:00.000Z',
    };
    snapshot.agents.push(owner);
    snapshot.teams[0]!.agentIds.push(owner.id);
    let activeHandlers: ReviewToolHandlers | null = null;
    let findingId = '';
    let reviewRun = 0;
    const runCodeReview = vi.fn(async (_agent, input) => {
      reviewRun += 1;
      if (!activeHandlers) throw new Error('Missing review tool context.');
      if (reviewRun === 1) {
        const finding = await activeHandlers.reportFinding({
          priority: 'p1', title: 'Authorize before writing',
          body: 'The public mutation writes before checking ownership.',
          location: { file: 'src/auth.ts', line: 42 },
        });
        findingId = finding.id;
      } else if (reviewRun === 2) {
        await activeHandlers.markFindingComplete({ findingId });
      }
      return {
        text: '',
        reviewerSession: input.reviewerSession ?? { kind: 'codex' as const, threadId: `review-thread-${reviewRun}` },
      };
    });
    const disposeCodeReview = vi.fn().mockResolvedValue(undefined);
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      runCodeReview,
      disposeCodeReview,
      sendPrompt: vi.fn(),
      interrupt: vi.fn(),
      respondToAgentRequest: vi.fn(),
      onEvent: () => () => undefined,
      close: vi.fn(),
    };
    let context = 0;
    const server = new ClawBackendServer({
      version: 'test',
      snapshot,
      driverRpc: new BackendDriverRpc(new Map([['codex', driver]])),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      codeReviewTools: {
        createReviewToolContext: (agentId, handlers) => {
          activeHandlers = handlers;
          return { id: `context-${++context}`, url: `http://review.test/mcp?agentId=${agentId}&reviewContextId=${context}` };
        },
        closeReviewToolContext: vi.fn(() => { activeHandlers = null; }),
      },
    });

    await request(server, backendMethods.agentCodeReviewStart, {
      agentId: owner.id,
      input: { scope: { type: 'uncommitted' }, threadMode: 'unbiased' },
    });
    await vi.waitFor(() => expect(owner.codeReview?.status).toBe('ready'));
    const session = owner.codeReview!;
    const round = session.rounds[0]!;
    expect(runCodeReview).toHaveBeenNthCalledWith(1, owner, expect.objectContaining({
      reviewMcpServerUrl: expect.stringContaining('reviewContextId=1'),
    }));

    await request(server, backendMethods.agentCodeReviewFindingDecide, {
      agentId: owner.id,
      input: { sessionId: session.id, roundId: round.id, findingId, decision: 'select' },
    });
    await request(server, backendMethods.agentCodeReviewRoundSubmit, { agentId: owner.id, sessionId: session.id });
    await vi.waitFor(() => expect(session.status).toBe('readyToFinish'));

    expect(runCodeReview).toHaveBeenNthCalledWith(2, owner, expect.objectContaining({
      reviewerSession: { kind: 'codex', threadId: 'review-thread-1' },
    }));
    expect(round.findings[0]!.remediation.state).toBe('fixed');

    await request(server, backendMethods.agentCodeReviewAgain, { agentId: owner.id, sessionId: session.id });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    expect(session.rounds).toHaveLength(2);
    expect(disposeCodeReview).toHaveBeenCalledExactlyOnceWith(owner, {
      kind: 'codex', threadId: 'review-thread-1',
    });
    expect(runCodeReview.mock.calls[2]?.[1]).not.toHaveProperty('reviewerSession');
    await request(server, backendMethods.agentCodeReviewRoundSubmit, { agentId: owner.id, sessionId: session.id });
    await request(server, backendMethods.agentCodeReviewFinish, { agentId: owner.id, sessionId: session.id });
    expect(owner.codeReview).toBeUndefined();
    expect(disposeCodeReview).toHaveBeenLastCalledWith(owner, {
      kind: 'codex', threadId: 'review-thread-3',
    });

    await server.close();
  });
});

async function request(server: ClawBackendServer, method: string, params: unknown): Promise<void> {
  const response = await server.handleMessage({ jsonrpc: '2.0', id: method, method, params });
  expect(response).toHaveProperty('result');
}
