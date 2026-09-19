import { describe, expect, it, vi } from 'vitest';
import type { Agent, AppSnapshot } from '@codex-claw/core/contracts';
import { createEmptySnapshot } from '@codex-claw/core/snapshot-construction';
import { activeCodeReviewRound } from '@codex-claw/core/code-review';
import { CodeReviewService, type CodeReviewToolPort } from '../code-review-service';
import type { ReviewToolHandlers } from '../review-tool-registry';

function agent(id: string): Agent {
  return {
    id, name: id, folder: '/repo', backend: 'codex', status: { type: 'idle' },
    createdAt: '2026-09-19T10:00:00.000Z', updatedAt: '2026-09-19T10:00:00.000Z',
  };
}

type ReviewScript = (handlers: ReviewToolHandlers) => Promise<{ text: string }>;

function harness(scripts: ReviewScript[]) {
  const snapshot: AppSnapshot = createEmptySnapshot();
  const owner = agent('owner');
  const fixer = agent('fixer');
  snapshot.agents = [owner, fixer];
  let context = 0;
  let activeHandlers: ReviewToolHandlers | null = null;
  const prompts: string[] = [];
  const fixes: Array<{ agentId: string; prompt: string }> = [];
  const changed = vi.fn();
  const tools: CodeReviewToolPort = {
    createReviewToolContext: (agentId, handlers) => {
      activeHandlers = handlers;
      return { id: `context-${++context}`, url: `http://review.test/mcp?agentId=${agentId}&reviewContextId=${context}` };
    },
    closeReviewToolContext: vi.fn(() => { activeHandlers = null; }),
  };
  let tick = 0;
  const service = new CodeReviewService({
    snapshot,
    tools,
    now: () => new Date(`2026-09-19T10:${String(tick++).padStart(2, '0')}:00.000Z`),
    runReview: async (_agent, prompt) => {
      prompts.push(prompt);
      const script = scripts.shift();
      if (!script || !activeHandlers) return { text: '' };
      return script(activeHandlers);
    },
    sendFixPrompt: (agentId, prompt) => fixes.push({ agentId, prompt }),
    changed,
  });
  return { snapshot, owner, fixer, service, prompts, fixes, changed };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('CodeReviewService', () => {
  it('persists model actions during review, verifies in a fresh round, and discards state on finish', async () => {
    let findingId = '';
    const test = harness([
      async (tools) => {
        const finding = await tools.reportFinding({
          fingerprint: 'src/auth.ts:ownership', priority: 'p1', summary: 'Ownership is skipped',
          rationale: 'The public mutation writes before checking ownership.',
          suggestedResolution: 'Authorize before writing.', location: { file: 'src/auth.ts', line: 42 },
        });
        findingId = finding.id;
        await tools.updateFinding({ findingId, priority: 'p0' });
        await tools.reportFinding({
          fingerprint: 'src/cache.ts:ttl', priority: 'p3', summary: 'Cache lifetime looks long',
          rationale: 'The value may be stale.', suggestedResolution: 'Reduce the TTL.',
        });
        return { text: '' };
      },
      async (tools) => {
        await tools.markFindingComplete({ findingId, evidence: 'Focused regression test passes.' });
        return { text: '' };
      },
    ]);

    const session = test.service.start(test.owner);
    expect(test.owner.codeReview).toBe(session);
    await settle();
    expect(session.status).toBe('ready');
    expect(test.changed).toHaveBeenCalled();
    const firstRound = activeCodeReviewRound(session);
    expect(firstRound.findings[0]?.priority).toBe('p0');

    test.service.decide(test.owner, { sessionId: session.id, roundId: firstRound.id, findingId, decision: 'accept' });
    test.service.assign(test.owner, { sessionId: session.id, roundId: firstRound.id, findingId, assignedAgentId: test.fixer.id });
    test.service.decide(test.owner, {
      sessionId: session.id, roundId: firstRound.id, findingId: firstRound.findings[1]!.id,
      decision: 'decline', reason: 'Event invalidation makes this safe.',
    });
    test.service.submit(test.owner, session.id);

    expect(session.status).toBe('fixing');
    expect(test.fixes).toEqual([expect.objectContaining({ agentId: 'fixer' })]);
    test.service.handleAgentStatusChanged('fixer', { type: 'working' });
    test.service.handleAgentStatusChanged('fixer', { type: 'idle' });
    expect(session.status).toBe('readyToFinish');

    const secondRound = test.service.reviewAgain(test.owner, session.id);
    expect(secondRound.reviewerContextId).not.toBe(firstRound.reviewerContextId);
    await settle();

    expect(test.prompts[1]).toContain('Event invalidation makes this safe.');
    expect(test.prompts[1]).toContain(findingId);
    expect(firstRound.findings[0]?.verification).toMatchObject({ state: 'passed', evidence: 'Focused regression test passes.' });
    test.service.submit(test.owner, session.id);
    expect(session.status).toBe('readyToFinish');
    test.service.finish(test.owner, session.id);
    expect(test.owner.codeReview).toBeUndefined();
  });

  it('retains a finding-linked question and the reviewer normal response', async () => {
    let findingId = '';
    const test = harness([
      async (tools) => {
        const finding = await tools.reportFinding({
          fingerprint: 'src/auth.ts:ownership', priority: 'p1', summary: 'Ownership is skipped',
          rationale: 'Public path reaches it.', suggestedResolution: 'Authorize first.',
        });
        findingId = finding.id;
        return { text: '' };
      },
      async () => ({ text: 'The public route reaches the mutation directly.' }),
    ]);
    const session = test.service.start(test.owner);
    await settle();
    const round = activeCodeReviewRound(session);

    test.service.discuss(test.owner, {
      sessionId: session.id, roundId: round.id, findingId,
      question: 'Is this reachable outside admin routes?',
    });
    await settle();

    expect(round.findings[0]?.discussion.map((message) => message.author)).toEqual(['user', 'reviewer']);
    expect(round.findings[0]?.discussion[1]?.body).toBe('The public route reaches the mutation directly.');
    expect(test.prompts[1]).toContain('Answer directly in your normal assistant response.');
  });
});
