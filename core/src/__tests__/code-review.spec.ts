import { describe, expect, it } from 'vitest';
import {
  codeReviewLedger,
  codeReviewProgress,
  isCodeReviewSession,
  type CodeReviewSession,
} from '../code-review';

function session(): CodeReviewSession {
  return {
    id: 'review-1',
    agentId: 'agent-1',
    status: 'readyToFinish',
    activeRoundId: 'round-2',
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T11:00:00.000Z',
    rounds: [{
      id: 'round-1',
      number: 1,
      status: 'completed',
      reviewerContextId: 'context-1',
      startedAt: '2026-09-19T10:00:00.000Z',
      completedAt: '2026-09-19T10:10:00.000Z',
      findings: [{
        id: 'finding-accepted',
        roundId: 'round-1',
        fingerprint: 'src/auth.ts:42:missing-check',
        priority: 'p1',
        summary: 'Authorization is skipped',
        rationale: 'The mutation is reachable without an ownership check.',
        suggestedResolution: 'Check ownership before mutating.',
        disposition: { state: 'accepted', decidedAt: '2026-09-19T10:15:00.000Z' },
        discussion: [{
          id: 'message-1',
          author: 'user',
          body: 'Admin callers are intentionally exempt.',
          createdAt: '2026-09-19T10:12:00.000Z',
        }],
        verification: { state: 'awaitingVerification', assignedAgentId: 'agent-2', completedAt: '2026-09-19T10:50:00.000Z' },
        createdAt: '2026-09-19T10:05:00.000Z',
        updatedAt: '2026-09-19T10:50:00.000Z',
      }, {
        id: 'finding-declined',
        roundId: 'round-1',
        fingerprint: 'src/cache.ts:8:ttl',
        priority: 'p3',
        summary: 'Cache lifetime looks long',
        rationale: 'Stale values may remain visible.',
        suggestedResolution: 'Reduce the TTL.',
        disposition: { state: 'declined', decidedAt: '2026-09-19T10:20:00.000Z', reason: 'The cache is invalidated by events.' },
        discussion: [],
        verification: { state: 'notRequested' },
        createdAt: '2026-09-19T10:06:00.000Z',
        updatedAt: '2026-09-19T10:20:00.000Z',
      }],
    }, {
      id: 'round-2',
      number: 2,
      status: 'ready',
      reviewerContextId: 'context-2',
      startedAt: '2026-09-19T11:00:00.000Z',
      findings: [{
        id: 'finding-new',
        roundId: 'round-2',
        fingerprint: 'src/jobs.ts:19:race',
        priority: 'p2',
        summary: 'Concurrent jobs can overwrite state',
        rationale: 'Both jobs write the same snapshot without a guard.',
        suggestedResolution: 'Use a compare-and-swap update.',
        disposition: { state: 'unresolved' },
        discussion: [],
        verification: { state: 'notRequested' },
        createdAt: '2026-09-19T11:04:00.000Z',
        updatedAt: '2026-09-19T11:04:00.000Z',
      }],
    }],
  };
}

describe('code review ledger', () => {
  it('carries declined exclusions, accepted regression checks, and behavior-changing discussion', () => {
    const ledger = codeReviewLedger(session());

    expect(ledger.exclusions).toEqual([expect.objectContaining({
      findingId: 'finding-declined',
      reason: 'The cache is invalidated by events.',
    })]);
    expect(ledger.regressionChecks).toEqual([expect.objectContaining({
      findingId: 'finding-accepted',
      verification: 'awaitingVerification',
    })]);
    expect(ledger.behaviorDecisions).toEqual([expect.objectContaining({ findingId: 'finding-accepted' })]);
  });

  it('reports cumulative unresolved and verification progress across rounds', () => {
    expect(codeReviewProgress(session())).toEqual({
      total: 3,
      unresolved: 1,
      accepted: 1,
      declined: 1,
      awaitingVerification: 1,
      verified: 0,
    });
  });

  it('counts a stable finding once when a later round re-observes it', () => {
    const review = session();
    review.rounds[1]!.findings.push({
      ...structuredClone(review.rounds[0]!.findings[0]!),
      roundId: 'round-2',
      rationale: 'The accepted defect is still reproducible.',
      verification: { state: 'failed', verifiedAt: '2026-09-19T11:05:00.000Z', roundId: 'round-2', evidence: 'Regression still fails.' },
      updatedAt: '2026-09-19T11:05:00.000Z',
    });

    expect(codeReviewProgress(review)).toMatchObject({ total: 3, accepted: 1, awaitingVerification: 0 });
  });

  it('rejects a persisted session with an incomplete decline decision', () => {
    const invalid = structuredClone(session()) as unknown as Record<string, unknown>;
    const rounds = invalid.rounds as Array<Record<string, unknown>>;
    const findings = rounds[0].findings as Array<Record<string, unknown>>;
    findings[1].disposition = { state: 'declined' };

    expect(isCodeReviewSession(invalid)).toBe(false);
    expect(isCodeReviewSession(session())).toBe(true);
  });
});
