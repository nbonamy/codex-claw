import { describe, expect, it, vi } from 'vitest';
import type { Agent, AppSnapshot, BackendSession } from '@codex-claw/core/contracts';
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
  snapshot.agents = [owner];
  let context = 0;
  let activeHandlers: ReviewToolHandlers | null = null;
  const turns: Array<{ prompt: string; reviewerSession?: BackendSession }> = [];
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
    runReview: async (_agent, prompt, _url, reviewerSession) => {
      turns.push({ prompt, ...(reviewerSession ? { reviewerSession } : {}) });
      const script = scripts.shift();
      const result = script && activeHandlers ? await script(activeHandlers) : { text: '' };
      return { ...result, reviewerSession: reviewerSession ?? { kind: 'codex', threadId: `review-thread-${turns.length}` } };
    },
    changed,
  });
  return { owner, service, turns, changed };
}

describe('CodeReviewService', () => {
  it('uses one reviewer thread for clarification and sequential fixes, then starts review again fresh', async () => {
    let selectedId = '';
    let rejectedId = '';
    const test = harness([
      async (tools) => {
        selectedId = (await tools.reportFinding({
          fingerprint: 'src/auth.ts:ownership', priority: 'p1', summary: 'Ownership is skipped',
          rationale: 'The public mutation writes before checking ownership.',
          suggestedResolution: 'Authorize before writing.', location: { file: 'src/auth.ts', line: 42 },
        })).id;
        rejectedId = (await tools.reportFinding({
          fingerprint: 'src/cache.ts:ttl', priority: 'p3', summary: 'Cache lifetime looks long',
          rationale: 'The value may be stale.', suggestedResolution: 'Reduce the TTL.',
        })).id;
        await tools.updateFinding({ findingId: selectedId, priority: 'p0' });
        return { text: '' };
      },
      async () => ({ text: 'The public route reaches the mutation directly.' }),
      async (tools) => {
        await tools.markFindingComplete({ findingId: selectedId, evidence: 'Focused regression test passes.' });
        return { text: '' };
      },
      async () => ({ text: '' }),
    ]);

    const session = test.service.start(test.owner);
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const firstRound = activeCodeReviewRound(session);
    expect(firstRound.findings[0]?.priority).toBe('p0');
    expect(firstRound.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-1' });

    test.service.discuss(test.owner, {
      sessionId: session.id, roundId: firstRound.id, findingId: selectedId,
      question: 'Finding: Ownership is skipped\n\nQuestion: Is this reachable outside admin routes?',
    });
    await vi.waitFor(() => expect(firstRound.findings[0]?.discussion).toHaveLength(2));

    test.service.decide(test.owner, { sessionId: session.id, roundId: firstRound.id, findingId: selectedId, decision: 'select' });
    test.service.decide(test.owner, {
      sessionId: session.id, roundId: firstRound.id, findingId: rejectedId,
      decision: 'reject', reason: 'Event invalidation makes this safe.',
    });
    test.service.submit(test.owner, session.id);
    await vi.waitFor(() => expect(session.status).toBe('readyToFinish'));

    expect(firstRound.findings.find((finding) => finding.id === selectedId)?.remediation).toMatchObject({
      state: 'fixed', evidence: 'Focused regression test passes.',
    });
    expect(firstRound.findings.find((finding) => finding.id === rejectedId)?.remediation.state).toBe('skipped');
    expect(test.turns.slice(1, 3).map((turn) => turn.reviewerSession)).toEqual([
      { kind: 'codex', threadId: 'review-thread-1' },
      { kind: 'codex', threadId: 'review-thread-1' },
    ]);

    const secondRound = test.service.reviewAgain(test.owner, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    expect(secondRound.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-4' });
    expect(test.turns[3]?.reviewerSession).toBeUndefined();
    expect(test.turns[3]?.prompt).toContain('Event invalidation makes this safe.');
    expect(test.turns[3]?.prompt).toContain(selectedId);

    test.service.submit(test.owner, session.id);
    expect(session.status).toBe('readyToFinish');
    test.service.finish(test.owner, session.id);
    expect(test.owner.codeReview).toBeUndefined();
  });

  it('moves selected findings through pending, fixing, and fixed one at a time', async () => {
    const ids: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstFixCanFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const test = harness([
      async (tools) => {
        for (const summary of ['First', 'Second']) {
          ids.push((await tools.reportFinding({
            fingerprint: summary, priority: 'p2', summary,
            rationale: `${summary} rationale`, suggestedResolution: `${summary} fix`,
          })).id);
        }
        return { text: '' };
      },
      async (tools) => {
        await firstFixCanFinish;
        await tools.markFindingComplete({ findingId: ids[0]! });
        return { text: '' };
      },
      async (tools) => {
        await tools.markFindingComplete({ findingId: ids[1]! });
        return { text: '' };
      },
    ]);
    const session = test.service.start(test.owner);
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const round = activeCodeReviewRound(session);
    for (const id of ids) test.service.decide(test.owner, { sessionId: session.id, roundId: round.id, findingId: id, decision: 'select' });

    test.service.submit(test.owner, session.id);
    await vi.waitFor(() => expect(round.findings.map((finding) => finding.remediation.state)).toEqual(['fixing', 'pending']));
    releaseFirst?.();
    await vi.waitFor(() => expect(round.findings.map((finding) => finding.remediation.state)).toEqual(['fixed', 'fixed']));
    expect(session.status).toBe('readyToFinish');
  });

  it('restores an interrupted fixing round and resumes it in the persisted reviewer thread', async () => {
    let findingId = '';
    const original = harness([async (tools) => {
      findingId = (await tools.reportFinding({
        fingerprint: 'restore', priority: 'p1', summary: 'Restore this fix',
        rationale: 'The process stopped mid-fix.', suggestedResolution: 'Resume the same review thread.',
      })).id;
      return { text: '' };
    }]);
    const session = original.service.start(original.owner);
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const round = activeCodeReviewRound(session);
    round.status = 'submitted';
    round.findings[0]!.decision = { state: 'selected', decidedAt: 'now' };
    round.findings[0]!.remediation = { state: 'fixing', startedAt: 'now' };
    session.status = 'fixing';

    const restored = harness([async (tools) => {
      await tools.markFindingComplete({ findingId });
      return { text: '' };
    }]);
    restored.owner.codeReview = structuredClone(session);
    restored.service.resumeInterrupted(restored.owner);

    await vi.waitFor(() => expect(restored.owner.codeReview?.status).toBe('readyToFinish'));
    expect(restored.owner.codeReview?.rounds[0]?.findings[0]?.remediation.state).toBe('fixed');
    expect(restored.turns[0]?.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-1' });
  });
});
