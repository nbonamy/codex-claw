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
  it('discards a review session through the app-owned request', async () => {
    const snapshot = createTestSnapshot();
    const owner: Agent = {
      id: 'agent-owner', teamId: snapshot.teams[0]!.id, name: 'Owner', folder: '/repo',
      backend: 'codex', status: { type: 'idle' },
      createdAt: '2026-09-19T10:00:00.000Z', updatedAt: '2026-09-19T10:00:00.000Z',
      codeReview: {
        id: 'review-1', targetAgentId: 'agent-owner', reviewerAgentId: 'agent-owner', scope: { type: 'uncommitted' },
        threadMode: 'current', status: 'failed', activeRoundId: 'round-1',
        rounds: [{ id: 'round-1', number: 1, status: 'failed', findings: [], startedAt: 'now' }],
        createdAt: 'now', updatedAt: 'now',
      },
    };
    snapshot.agents.push(owner);
    snapshot.teams[0]!.agentIds.push(owner.id);
    snapshot.agentGitStatuses[owner.id] = {
      folder: '/repo', branch: 'feat/review', ahead: 1, behind: 0,
      changedFiles: 2, addedLines: 12, removedLines: 3, hasUntracked: false,
      state: 'dirty', updatedAt: '2026-09-19T10:00:00.000Z',
    };
    const server = new ClawBackendServer({
      version: 'test', snapshot,
      driverRpc: new BackendDriverRpc(new Map()),
      saveSnapshot: vi.fn().mockResolvedValue(undefined),
      codeReviewTools: {
        createReviewToolContext: () => ({ id: 'unused', url: 'http://review.test/mcp' }),
        closeReviewToolContext: vi.fn(),
      },
    });

    await request(server, backendMethods.agentCodeReviewDiscard, {
      agentId: owner.id, sessionId: 'review-1',
    });

    expect(owner.codeReview).toBeUndefined();
    await server.close();
  });

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
    const releaseConversation = vi.fn();
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      runCodeReview,
      disposeCodeReview,
      releaseConversation,
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

    const started = await request(server, backendMethods.agentCodeReviewStart, {
      agentId: owner.id,
      input: { scope: { type: 'uncommitted' }, threadMode: 'independent' },
    });
    const reviewer = snapshot.agents.find((candidate) => candidate.id !== owner.id)!;
    await vi.waitFor(() => expect(reviewer.codeReview?.status).toBe('ready'));
    const session = reviewer.codeReview!;
    expect(started.activeAgentId).toBe(reviewer.id);
    expect(session).toMatchObject({ targetAgentId: owner.id, reviewerAgentId: reviewer.id, threadMode: 'independent' });
    expect(reviewer).toMatchObject({
      folder: owner.folder,
      backend: owner.backend,
      teamId: owner.teamId,
    });
    expect(snapshot.agentGitStatuses[reviewer.id]).toStrictEqual(snapshot.agentGitStatuses[owner.id]);
    const round = session.rounds[0]!;
    expect(runCodeReview).toHaveBeenNthCalledWith(1, reviewer, expect.objectContaining({
      reviewMcpServerUrl: expect.stringContaining('reviewContextId=1'),
    }));

    await request(server, backendMethods.agentCodeReviewFindingDecide, {
      agentId: reviewer.id,
      input: { sessionId: session.id, roundId: round.id, findingId, decision: 'select' },
    });
    await request(server, backendMethods.agentCodeReviewRoundSubmit, { agentId: reviewer.id, sessionId: session.id });
    await vi.waitFor(() => expect(session.status).toBe('readyToFinish'));

    expect(runCodeReview).toHaveBeenNthCalledWith(2, reviewer, expect.objectContaining({
      reviewerSession: { kind: 'codex', threadId: 'review-thread-1' },
    }));
    expect(round.findings[0]!.remediation.state).toBe('fixed');

    await request(server, backendMethods.agentCodeReviewAgain, { agentId: reviewer.id, sessionId: session.id });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    expect(session.rounds).toHaveLength(2);
    expect(disposeCodeReview).toHaveBeenCalledExactlyOnceWith(
      reviewer,
      { kind: 'codex', threadId: 'review-thread-1' },
    );
    expect(releaseConversation).toHaveBeenCalledExactlyOnceWith(reviewer.id);
    expect(runCodeReview.mock.calls[2]?.[1]).not.toHaveProperty('reviewerSession');
    await request(server, backendMethods.agentCodeReviewRoundSubmit, { agentId: reviewer.id, sessionId: session.id });
    const finished = await request(server, backendMethods.agentCodeReviewFinish, { agentId: reviewer.id, sessionId: session.id });
    expect(snapshot.agents).toStrictEqual([owner]);
    expect(snapshot.agentGitStatuses[reviewer.id]).toBeUndefined();
    expect(disposeCodeReview).toHaveBeenCalledTimes(2);
    expect(finished.activeAgentId).toBe(owner.id);

    await server.close();
  });
});

async function request(server: ClawBackendServer, method: string, params: unknown): Promise<import('@codex-claw/core/contracts').AppSnapshot> {
  const response = await server.handleMessage({ jsonrpc: '2.0', id: method, method, params });
  expect(response).toHaveProperty('result');
  return (response as { result: import('@codex-claw/core/contracts').AppSnapshot }).result;
}
