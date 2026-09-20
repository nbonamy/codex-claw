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

function harness(scripts: ReviewScript[], deleteReviewer = async (_agent: Agent): Promise<void> => undefined) {
  const snapshot: AppSnapshot = createEmptySnapshot();
  const owner = agent('owner');
  snapshot.agents = [owner];
  let context = 0;
  let activeHandlers: ReviewToolHandlers | null = null;
  const turns: Array<{ prompt: string; reviewerSession?: BackendSession }> = [];
  const reset: string[] = [];
  const deleted: string[] = [];
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
    resetReviewer: async (reviewer) => {
      reset.push(reviewer.id);
      delete reviewer.backendSession;
    },
    deleteReviewer: async (reviewer) => {
      deleted.push(reviewer.id);
      await deleteReviewer(reviewer);
      snapshot.agents = snapshot.agents.filter((candidate) => candidate.id !== reviewer.id);
    },
    changed,
  });
  return { owner, snapshot, service, turns, reset, deleted, changed };
}

function reviewer(test: ReturnType<typeof harness>, session: { reviewerAgentId: string }): Agent {
  const found = test.snapshot.agents.find((candidate) => candidate.id === session.reviewerAgentId);
  if (!found) throw new Error('Reviewer agent missing from test snapshot.');
  return found;
}

describe('CodeReviewService', () => {
  it('creates an independent reviewer as a normal adjacent agent for the same workspace', async () => {
    const test = harness([async () => ({ text: '' })]);
    const neighbor = agent('neighbor');
    test.owner.avatar = 'owl';
    test.owner.openInApplication = 'vscode';
    test.owner.workspace = {
      kind: 'git', folder: '/repo', repositoryName: 'claw', repositoryRoot: '/repo',
      branch: 'feat/review', isLinkedWorktree: false, primaryWorktreeRoot: '/repo',
      updatedAt: '2026-09-19T10:00:00.000Z',
    };
    test.snapshot.agents.push(neighbor);
    test.snapshot.agentGitStatuses[test.owner.id] = {
      folder: '/repo', branch: 'feat/review', ahead: 1, behind: 0,
      changedFiles: 2, addedLines: 12, removedLines: 3, hasUntracked: false,
      state: 'dirty', updatedAt: '2026-09-19T10:00:00.000Z',
    };

    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    const visibleReviewer = reviewer(test, session);

    expect(test.snapshot.agents.map((candidate) => candidate.id)).toEqual([
      test.owner.id, visibleReviewer.id, neighbor.id,
    ]);
    expect(visibleReviewer).toMatchObject({
      name: 'Review', avatar: 'owl', folder: '/repo', workspace: test.owner.workspace,
      backend: test.owner.backend, openInApplication: 'vscode', status: { type: 'idle' },
    });
    expect(visibleReviewer.backendSession).toBeUndefined();
    expect(test.snapshot.agentGitStatuses[visibleReviewer.id]).toStrictEqual(
      test.snapshot.agentGitStatuses[test.owner.id],
    );
    expect(test.snapshot.agentGitStatuses[visibleReviewer.id]).not.toBe(
      test.snapshot.agentGitStatuses[test.owner.id],
    );
  });

  it('discards an independent review by deleting its visible reviewer agent', async () => {
    const test = harness([async () => ({ text: '' })]);
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);

    await test.service.discard(visibleReviewer, session.id);

    expect(test.snapshot.agents).toStrictEqual([test.owner]);
    expect(test.deleted).toStrictEqual([visibleReviewer.id]);
  });

  it('retains an independent review ledger when its visible reviewer cannot be deleted', async () => {
    const test = harness([async () => ({ text: '' })], async () => {
      throw new Error('Reviewer agent could not be deleted.');
    });
    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);
    test.service.submit(visibleReviewer, session.id);

    await expect(test.service.finish(visibleReviewer, session.id)).rejects.toThrow('could not be deleted');

    expect(visibleReviewer.codeReview).toBe(session);
    expect(session.status).toBe('readyToFinish');
  });

  it('retries a failed independent review against the original target in the same visible reviewer', async () => {
    const test = harness([
      async () => { throw new Error('Reviewer stopped.'); },
      async () => ({ text: '' }),
    ]);
    const failed = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(failed.status).toBe('failed'));
    const visibleReviewer = reviewer(test, failed);

    const retried = test.service.start(visibleReviewer, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(retried.status).toBe('ready'));

    expect(retried.targetAgentId).toBe(test.owner.id);
    expect(retried.reviewerAgentId).toBe(visibleReviewer.id);
    expect(test.snapshot.agents).toHaveLength(2);
    expect(test.reset).toStrictEqual([visibleReviewer.id]);
    expect(test.turns[1]?.reviewerSession).toBeUndefined();
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
    expect(test.turns[0]?.prompt).toContain('respond with exactly "Review complete." and end the turn');

    test.service.submit(test.owner, session.id);
    await test.service.reviewAgain(test.owner, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));

    expect(test.turns[1]?.reviewerSession).toStrictEqual({ kind: 'codex', threadId: 'current-thread' });
    expect(session.rounds[1]?.reviewerSession).toStrictEqual({ kind: 'codex', threadId: 'current-thread' });
    test.service.submit(test.owner, session.id);
    await test.service.finish(test.owner, session.id);
    expect(test.reset).toStrictEqual([]);
    expect(test.deleted).toStrictEqual([]);
  });

  it('carries skipped findings from every prior round inside the reviewer context', async () => {
    let firstSkippedId = '';
    let secondSkippedId = '';
    const test = harness([
      async (tools) => {
        firstSkippedId = (await tools.reportFinding({
          priority: 'p2', title: 'Invalidate the round one cache',
          body: 'The cache could be stale.',
        })).id;
        return { text: '' };
      },
      async (tools) => {
        secondSkippedId = (await tools.reportFinding({
          priority: 'p3', title: 'Reduce round two logging',
          body: 'The log could be noisy.',
        })).id;
        return { text: '' };
      },
      async () => ({ text: '' }),
    ]);

    const session = test.service.start(test.owner, {
      scope: { type: 'uncommitted' }, threadMode: 'independent',
    });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);
    let round = activeCodeReviewRound(session);
    test.service.decide(visibleReviewer, {
      sessionId: session.id, roundId: round.id, findingId: firstSkippedId,
      decision: 'reject', reason: 'The event stream already invalidates this cache.',
    });
    test.service.submit(visibleReviewer, session.id);

    await test.service.reviewAgain(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    round = activeCodeReviewRound(session);
    test.service.decide(visibleReviewer, {
      sessionId: session.id, roundId: round.id, findingId: secondSkippedId,
      decision: 'reject', reason: 'This verbosity is intentional during migration.',
    });
    test.service.submit(visibleReviewer, session.id);

    await test.service.reviewAgain(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));

    const thirdRoundPrompt = test.turns[2]!.prompt;
    const contextEnd = thirdRoundPrompt.indexOf('</context>');
    expect(thirdRoundPrompt.startsWith('<context>')).toBe(true);
    expect(contextEnd).toBeGreaterThan(0);
    expect(thirdRoundPrompt.slice(0, contextEnd)).toContain('Invalidate the round one cache');
    expect(thirdRoundPrompt.slice(0, contextEnd)).toContain('Reduce round two logging');
    expect(thirdRoundPrompt.slice(contextEnd)).toContain('Review only the current uncommitted changes');
  });

  it('uses one reviewer thread for clarification and sequential fixes, then starts review again fresh', async () => {
    let selectedId = '';
    let rejectedId = '';
    const test = harness([
      async (tools) => {
        selectedId = (await tools.reportFinding({
          priority: 'p1', title: 'Authorize before writing',
          body: 'The public mutation writes before checking ownership.',
          location: { file: 'src/auth.ts', line: 42 },
        })).id;
        rejectedId = (await tools.reportFinding({
          priority: 'p3', title: 'Reduce the cache lifetime',
          body: 'The value may be stale.',
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

    const session = test.service.start(test.owner, { scope: { type: 'uncommitted' }, threadMode: 'independent' });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);
    const firstRound = activeCodeReviewRound(session);
    expect(firstRound.findings[0]?.priority).toBe('p0');
    expect(firstRound.findings.map((finding) => finding.decision.state)).toEqual(['selected', 'selected']);
    expect(firstRound.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-1' });

    test.service.discuss(visibleReviewer, {
      sessionId: session.id, roundId: firstRound.id, findingId: selectedId,
      question: 'Finding: Authorize before writing\n\nQuestion: Is this reachable outside admin routes?',
    });
    await vi.waitFor(() => expect(firstRound.findings[0]?.discussion).toHaveLength(2));
    expect(test.turns[1]?.prompt).toBe(
      'Finding: Authorize before writing\n\nQuestion: Is this reachable outside admin routes?',
    );

    test.service.decide(visibleReviewer, {
      sessionId: session.id, roundId: firstRound.id, findingId: rejectedId,
      decision: 'reject',
    });
    test.service.submit(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('readyToFinish'));

    expect(firstRound.findings.find((finding) => finding.id === selectedId)?.remediation).toMatchObject({
      state: 'fixed', evidence: 'Focused regression test passes.',
    });
    expect(firstRound.findings.find((finding) => finding.id === rejectedId)?.remediation.state).toBe('skipped');
    expect(test.turns.slice(1, 3).map((turn) => turn.reviewerSession)).toEqual([
      { kind: 'codex', threadId: 'review-thread-1' },
      { kind: 'codex', threadId: 'review-thread-1' },
    ]);

    const secondRound = await test.service.reviewAgain(visibleReviewer, session.id);
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    expect(secondRound.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-4' });
    expect(test.turns[3]?.reviewerSession).toBeUndefined();
    expect(test.turns[3]?.prompt).toContain('Not selected for remediation.');
    expect(test.turns[3]?.prompt).toContain(selectedId);
    expect(test.reset).toStrictEqual([visibleReviewer.id]);

    test.service.submit(visibleReviewer, session.id);
    expect(session.status).toBe('readyToFinish');
    await test.service.finish(visibleReviewer, session.id);
    expect(test.deleted).toStrictEqual([visibleReviewer.id]);
    expect(test.snapshot.agents).toStrictEqual([test.owner]);
  });

  it('moves selected findings through pending, fixing, and fixed one at a time', async () => {
    const ids: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstFixCanFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const test = harness([
      async (tools) => {
        for (const title of ['First', 'Second']) {
          ids.push((await tools.reportFinding({
            priority: 'p2', title, body: `${title} finding body.`,
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
    const session = test.service.start(test.owner, { scope: { type: 'uncommitted' }, threadMode: 'independent' });
    await vi.waitFor(() => expect(session.status).toBe('ready'));
    const visibleReviewer = reviewer(test, session);
    const round = activeCodeReviewRound(session);
    expect(round.findings.map((finding) => finding.decision.state)).toEqual(['selected', 'selected']);
    round.findings[0]!.decision = { state: 'undecided' };

    test.service.submit(visibleReviewer, session.id);
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
        priority: 'p1', title: 'Restore this fix',
        body: 'The process stopped mid-fix; resume the same review thread.',
      })).id;
      return { text: '' };
    }]);
    const session = original.service.start(original.owner, { scope: { type: 'uncommitted' }, threadMode: 'independent' });
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
    const restoredReviewer: Agent = {
      ...structuredClone(reviewer(original, session)),
      codeReview: structuredClone(session),
    };
    restored.snapshot.agents.push(restoredReviewer);
    await restored.service.resumeInterrupted(restoredReviewer);

    await vi.waitFor(() => expect(restoredReviewer.codeReview?.status).toBe('readyToFinish'));
    expect(restoredReviewer.codeReview?.rounds[0]?.findings[0]?.remediation.state).toBe('fixed');
    expect(restored.turns[0]?.reviewerSession).toEqual({ kind: 'codex', threadId: 'review-thread-1' });
  });
});
