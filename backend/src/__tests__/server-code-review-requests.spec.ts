import { describe, expect, it, vi } from 'vitest';
import { backendMethods } from '@codex-claw/core/backend-protocol/methods';
import { codexBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import type { AgentBackendDriver, BackendEvent } from '@codex-claw/core/backend-driver';
import type { Agent } from '@codex-claw/core/contracts';
import { BackendDriverRpc } from '../driver-rpc';
import { ClawBackendServer } from '../server';
import { createTestSnapshot } from './server-test-fixtures';
import type { ReviewToolHandlers } from '../review/review-tool-registry';

describe('ClawBackendServer code review workflow', () => {
  it('owns review state from readiness through arbitration, fixes, verification, and finish', async () => {
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
    const fixer: Agent = { ...owner, id: 'agent-fixer', name: 'Fixer' };
    snapshot.agents.push(owner, fixer);
    snapshot.teams[0]!.agentIds.push(owner.id, fixer.id);
    let listener: ((event: BackendEvent) => void) | null = null;
    let activeHandlers: ReviewToolHandlers | null = null;
    let findingId = '';
    let reviewRun = 0;
    const runCodeReview = vi.fn(async () => {
      reviewRun += 1;
      if (!activeHandlers) throw new Error('Missing review tool context.');
      if (reviewRun === 1) {
        const finding = await activeHandlers.reportFinding({
          fingerprint: 'src/auth.ts:ownership', priority: 'p1', summary: 'Ownership is skipped',
          rationale: 'The public mutation writes before authorizing.', suggestedResolution: 'Authorize before writing.',
          location: { file: 'src/auth.ts', line: 42 },
        });
        findingId = finding.id;
      } else {
        await activeHandlers.markFindingComplete({ findingId });
      }
      return { text: '' };
    });
    const sendPrompt = vi.fn().mockResolvedValue({ backendSession: { kind: 'codex', threadId: 'fix-thread' } });
    const driver: AgentBackendDriver = {
      backend: 'codex',
      getRuntimeStatus: () => ({ backend: 'codex', status: 'running' }),
      getCapabilities: () => codexBackendCapabilities,
      runCodeReview,
      sendPrompt,
      interrupt: vi.fn(),
      respondToAgentRequest: vi.fn(),
      onEvent: (next) => { listener = next; return () => undefined; },
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

    await request(server, backendMethods.agentCodeReviewStart, { agentId: owner.id });
    await settle();
    const session = owner.codeReview!;
    const round = session.rounds[0]!;
    expect(session.status).toBe('ready');
    expect(runCodeReview).toHaveBeenCalledWith(owner, expect.objectContaining({
      reviewMcpServerUrl: expect.stringContaining('reviewContextId=1'),
    }));

    await request(server, backendMethods.agentCodeReviewFindingDecide, {
      agentId: owner.id,
      input: { sessionId: session.id, roundId: round.id, findingId, decision: 'accept' },
    });
    await request(server, backendMethods.agentCodeReviewFindingAssign, {
      agentId: owner.id,
      input: { sessionId: session.id, roundId: round.id, findingId, assignedAgentId: fixer.id },
    });
    await request(server, backendMethods.agentCodeReviewRoundSubmit, { agentId: owner.id, sessionId: session.id });
    expect(sendPrompt).toHaveBeenCalledWith(fixer, expect.stringContaining(findingId), undefined);

    const emit = listener as ((event: BackendEvent) => void) | null;
    emit?.({ agentId: fixer.id, type: 'agent.statusChanged', payload: { type: 'working' } });
    emit?.({ agentId: fixer.id, type: 'agent.statusChanged', payload: { type: 'idle' } });
    await settle();
    expect(session.status).toBe('readyToFinish');

    await request(server, backendMethods.agentCodeReviewAgain, { agentId: owner.id, sessionId: session.id });
    await settle();
    expect(session.rounds).toHaveLength(2);
    expect(round.findings[0]!.verification.state).toBe('passed');
    await request(server, backendMethods.agentCodeReviewRoundSubmit, { agentId: owner.id, sessionId: session.id });
    await request(server, backendMethods.agentCodeReviewFinish, { agentId: owner.id, sessionId: session.id });
    expect(owner.codeReview).toBeUndefined();

    await server.close();
  });
});

async function request(server: ClawBackendServer, method: string, params: unknown): Promise<void> {
  const response = await server.handleMessage({ jsonrpc: '2.0', id: method, method, params });
  expect(response).toHaveProperty('result');
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
