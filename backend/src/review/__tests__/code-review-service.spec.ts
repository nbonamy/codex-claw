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

function harness(scripts: ReviewScript[], dispose = async (_session: BackendSession): Promise<void> => undefined) {
  const snapshot: AppSnapshot = createEmptySnapshot();
  const owner = agent('owner');
  snapshot.agents = [owner];
  let context = 0;
  let activeHandlers: ReviewToolHandlers | null = null;
  const turns: Array<{ prompt: string; reviewerSession?: BackendSession }> = [];
  const disposed: BackendSession[] = [];
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
    disposeReview: async (_agent, reviewerSession) => {
      disposed.push(reviewerSession);
      await dispose(reviewerSession);
    },
    changed,
  });
  return { owner, service, turns, disposed, changed };
}

describe('CodeReviewService', () => {
  it('retains an unbiased review ledger when its owned thread cannot be deleted', async () => {
    const test = harness([async () => ({ text: '' })], async () => {
      throw new Error('Reviewer thread could not be deleted.');
    });
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'unbiased',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    test.service.submit(test.owner, session.id);

    await expect(test.service.finish(test.owner, session.id)).rejects.toThrow('could not be deleted');

    expect(test.owner.codeReview).toBe(session);
    expect(session.status).toBe('readyToFinish');
  });

  it('keeps every round in the current thread and never disposes that user-owned conversation', async () => {
    const test = harness([
      async () => ({ text: '' }),
      async () => ({ text: '' }),
    ]);
    test.owner.backendSession = { kind: 'codex', threadId: 'current-thread' };

    const session = test.service.start(test.owner, {
      scope: { type: 'branch', baseRef: 'origin/main' },
      threadMode: 'current',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));

    expect(session.scope).toStrictEqual({ type: 'branch', baseRef: 'origin/main' });
    expect(session.threadMode).toBe('current');
    expect(test.turns[0]?.reviewerSession).toStrictEqual({ kind: 'codex', threadId: 'current-thread' });
    expect(test.turns[0]?.prompt).toContain('the current branch against origin/main');

    test.service.submit(test.owner, session.id);
    await test.service.reviewAgain(test.owner, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));

    expect(test.turns[1]?.reviewerSession).toStrictEqual({ kind: 'codex', threadId: 'current-thread' });
    expect(session.rounds[1]?.reviewerSession).toStrictEqual({ kind: 'codex', threadId: 'current-thread' });
    test.service.submit(test.owner, session.id);
    await test.service.finish(test.owner, session.id);
    expect(test.disposed).toStrictEqual([]);
  });

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

    const session = test.service.start(test.owner, { scope: { type: 'uncommitted' }, threadMode: 'unbiased' });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const firstRound = activeCodeReviewRound(session);
    expect(firstRound.findings[0]?.priority).toBe('p0');
    expect(firstRound.findings.map((finding) => finding.decision.state)).toEqual(['selected', 'selected']);
    expect(firstRound.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-1' });

    test.service.discuss(test.owner, {
      sessionId: session.id, roundId: firstRound.id, findingId: selectedId,
      question: 'Finding: Ownership is skipped\n\nQuestion: Is this reachable outside admin routes?',
    });
    await vi.waitFor(() => expect(firstRound.findings[0]?.discussion).toHaveLength(2));

    test.service.decide(test.owner, {
      sessionId: session.id, roundId: firstRound.id, findingId: rejectedId,
      decision: 'reject',
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

    const secondRound = await test.service.reviewAgain(test.owner, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    expect(secondRound.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-4' });
    expect(test.turns[3]?.reviewerSession).toBeUndefined();
    expect(test.turns[3]?.prompt).toContain('Not selected for remediation.');
    expect(test.turns[3]?.prompt).toContain(selectedId);
    expect(test.disposed).toStrictEqual([{ kind: 'codex', threadId: 'review-thread-1' }]);

    test.service.submit(test.owner, session.id);
    expect(session.status).toBe('readyToFinish');
    await test.service.finish(test.owner, session.id);
    expect(test.disposed).toStrictEqual([
      { kind: 'codex', threadId: 'review-thread-1' },
      { kind: 'codex', threadId: 'review-thread-4' },
    ]);
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
    const session = test.service.start(test.owner, { scope: { type: 'uncommitted' }, threadMode: 'unbiased' });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const round = activeCodeReviewRound(session);
    expect(round.findings.map((finding) => finding.decision.state)).toEqual(['selected', 'selected']);
    round.findings[0]!.decision = { state: 'undecided' };

    test.service.submit(test.owner, session.id);
    expect(round.findings[0]!.decision.state).toBe('selected');
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
    const session = original.service.start(original.owner, { scope: { type: 'uncommitted' }, threadMode: 'unbiased' });
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
    await restored.service.resumeInterrupted(restored.owner);

    await vi.waitFor(() => expect(restored.owner.codeReview?.status).toBe('readyToFinish'));
    expect(restored.owner.codeReview?.rounds[0]?.findings[0]?.remediation.state).toBe('fixed');
    expect(restored.turns[0]?.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-1' });
  });
});
