import { describe, expect, it } from 'vitest';
import {
  codeReviewLedger,
  codeReviewProgress,
  isCodeReviewSession,
  isCodeReviewStartInput,
  type CodeReviewSession,
} from '../code-review';

function session(): CodeReviewSession {
  return {
    id: 'review-1',
    agentId: 'agent-1',
    scope: { type: 'uncommitted' },
    threadMode: 'unbiased',
    status: 'ready',
    activeRoundId: 'round-2',
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T11:00:00.000Z',
    rounds: [{
      id: 'round-1',
      number: 1,
      status: 'completed',
      reviewerSession: { kind: 'codex', threadId: 'review-thread-1' },
      startedAt: '2026-09-19T10:00:00.000Z',
      completedAt: '2026-09-19T10:50:00.000Z',
      findings: [{
        id: 'finding-fixed',
        roundId: 'round-1',
        fingerprint: 'src/auth.ts:42:missing-check',
        priority: 'p1',
        summary: 'Authorization is skipped',
        rationale: 'The mutation is reachable without an ownership check.',
        suggestedResolution: 'Check ownership before mutating.',
        decision: { state: 'selected', decidedAt: '2026-09-19T10:15:00.000Z' },
        discussion: [{
          id: 'message-1',
          author: 'user',
          body: 'Admin callers are intentionally exempt.',
          createdAt: '2026-09-19T10:12:00.000Z',
        }],
        remediation: { state: 'fixed', completedAt: '2026-09-19T10:50:00.000Z' },
        createdAt: '2026-09-19T10:05:00.000Z',
        updatedAt: '2026-09-19T10:50:00.000Z',
      }, {
        id: 'finding-skipped',
        roundId: 'round-1',
        fingerprint: 'src/cache.ts:8:ttl',
        priority: 'p3',
        summary: 'Cache lifetime looks long',
        rationale: 'Stale values may remain visible.',
        suggestedResolution: 'Reduce the TTL.',
        decision: { state: 'rejected', decidedAt: '2026-09-19T10:20:00.000Z', reason: 'The cache is invalidated by events.' },
        discussion: [],
        remediation: { state: 'skipped', startedAt: '2026-09-19T10:25:00.000Z' },
        createdAt: '2026-09-19T10:06:00.000Z',
        updatedAt: '2026-09-19T10:25:00.000Z',
      }],
    }, {
      id: 'round-2',
      number: 2,
      status: 'ready',
      reviewerSession: { kind: 'claude', sessionId: 'review-thread-2', transport: 'stdio' },
      startedAt: '2026-09-19T11:00:00.000Z',
      findings: [{
        id: 'finding-new',
        roundId: 'round-2',
        fingerprint: 'src/jobs.ts:19:race',
        priority: 'p2',
        summary: 'Concurrent jobs can overwrite state',
        rationale: 'Both jobs write the same snapshot without a guard.',
        suggestedResolution: 'Use a compare-and-swap update.',
        decision: { state: 'undecided' },
        discussion: [],
        remediation: { state: 'notStarted' },
        createdAt: '2026-09-19T11:04:00.000Z',
        updatedAt: '2026-09-19T11:04:00.000Z',
      }],
    }],
  };
}

describe('code review ledger', () => {
  it('accepts only complete review setup choices', () => {
    expect(isCodeReviewStartInput({ scope: { type: 'uncommitted' }, threadMode: 'unbiased' })).toBe(true);
    expect(isCodeReviewStartInput({ scope: { type: 'branch', baseRef: 'origin/main' }, threadMode: 'current' })).toBe(true);
    expect(isCodeReviewStartInput({ scope: { type: 'branch', baseRef: '' }, threadMode: 'current' })).toBe(false);
    expect(isCodeReviewStartInput({ scope: { type: 'uncommitted' }, threadMode: 'anchored' })).toBe(false);
  });

  it('carries skipped exclusions, fixed regression checks, and behavior-changing discussion', () => {
    const ledger = codeReviewLedger(session());

    expect(ledger.exclusions).toEqual([expect.objectContaining({
      findingId: 'finding-skipped',
      reason: 'The cache is invalidated by events.',
    })]);
    expect(ledger.regressionChecks).toEqual([expect.objectContaining({ findingId: 'finding-fixed' })]);
    expect(ledger.behaviorDecisions).toEqual([expect.objectContaining({ findingId: 'finding-fixed' })]);
  });

  it('reports cumulative choices and remediation progress across rounds', () => {
    expect(codeReviewProgress(session())).toEqual({
      total: 3,
      undecided: 1,
      selected: 1,
      rejected: 1,
      skipped: 1,
      pending: 0,
      fixing: 0,
      fixed: 1,
    });
  });

  it('counts a stable finding once when a later round raises it again', () => {
    const review = session();
    review.rounds[1]!.findings.push({
      ...structuredClone(review.rounds[0]!.findings[0]!),
      roundId: 'round-2',
      rationale: 'The defect is actionable again.',
      decision: { state: 'undecided' },
      remediation: { state: 'notStarted' },
      updatedAt: '2026-09-19T11:05:00.000Z',
    });

    expect(codeReviewProgress(review)).toMatchObject({ total: 3, undecided: 2, fixed: 0 });
  });

  it('rejects a persisted session with an incomplete rejection decision', () => {
    const invalid = structuredClone(session()) as unknown as Record<string, unknown>;
    const rounds = invalid.rounds as Array<Record<string, unknown>>;
    const findings = rounds[0]!.findings as Array<Record<string, unknown>>;
    findings[1]!.decision = { state: 'rejected' };

    expect(isCodeReviewSession(invalid)).toBe(false);
    expect(isCodeReviewSession(session())).toBe(true);
  });
});
