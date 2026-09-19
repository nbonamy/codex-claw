import { describe, expect, it, vi } from 'vitest';
import type { CodeReviewFinding } from '@codex-claw/core/code-review';
import { ReviewToolRegistry } from '../review-tool-registry';

const finding = (): CodeReviewFinding => ({
  id: 'finding-1', roundId: 'round-1', fingerprint: 'src/auth.ts:ownership', priority: 'p1',
  summary: 'Ownership is not checked', rationale: 'The handler writes before authorizing.',
  suggestedResolution: 'Authorize before the write.', disposition: { state: 'unresolved' },
  discussion: [], verification: { state: 'notRequested' },
  createdAt: '2026-09-19T10:00:00.000Z', updatedAt: '2026-09-19T10:00:00.000Z',
});

describe('ReviewToolRegistry', () => {
  it('routes only the three model-owned finding actions through an agent-scoped context', async () => {
    const registry = new ReviewToolRegistry();
    const handlers = {
      reportFinding: vi.fn(async () => finding()),
      updateFinding: vi.fn(async () => ({ ...finding(), priority: 'p0' as const })),
      markFindingComplete: vi.fn(async () => ({
        ...finding(),
        disposition: { state: 'accepted' as const, decidedAt: '2026-09-19T10:01:00.000Z' },
        verification: { state: 'passed' as const, verifiedAt: '2026-09-19T10:02:00.000Z', roundId: 'round-2' },
      })),
    };
    const context = registry.create('agent-1', handlers);

    await context.reportFinding({
      fingerprint: 'src/auth.ts:ownership', priority: 'p1', summary: 'Ownership is not checked',
      rationale: 'The handler writes before authorizing.', suggestedResolution: 'Authorize before the write.',
    });
    await context.updateFinding({ findingId: 'finding-1', priority: 'p0' });
    await context.markFindingComplete({ findingId: 'finding-1', evidence: 'Focused test passes.' });

    expect(handlers.reportFinding).toHaveBeenCalledOnce();
    expect(handlers.updateFinding).toHaveBeenCalledWith({ findingId: 'finding-1', priority: 'p0' });
    expect(handlers.markFindingComplete).toHaveBeenCalledWith({ findingId: 'finding-1', evidence: 'Focused test passes.' });
    expect(registry.resolve('agent-2', context.id)).toBeNull();

    registry.close(context.id);
    expect(registry.resolve('agent-1', context.id)).toBeNull();
    expect(() => context.reportFinding({
      fingerprint: 'later', priority: 'p3', summary: 'Later', rationale: 'Later', suggestedResolution: 'Later',
    })).toThrow('no longer available');
  });
});
