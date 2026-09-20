import { describe, expect, it, vi } from 'vitest';
import type { CodeReviewFinding } from '@codex-claw/core/code-review';
import { ReviewToolRegistry } from '../review-tool-registry';

const finding = (): CodeReviewFinding => ({
  id: 'finding-1', roundId: 'round-1', priority: 'p1',
  title: 'Authorize before the write', body: 'The handler writes before checking ownership.',
  decision: { state: 'undecided' },
  discussion: [], remediation: { state: 'notStarted' },
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
        decision: { state: 'selected' as const, decidedAt: '2026-09-19T10:01:00.000Z' },
        remediation: { state: 'fixed' as const, completedAt: '2026-09-19T10:02:00.000Z' },
      })),
    };
    const context = registry.create('agent-1', handlers);

    await context.reportFinding({
      priority: 'p1', title: 'Authorize before the write',
      body: 'The handler writes before checking ownership.',
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
      priority: 'p3', title: 'Handle this later', body: 'This can be handled later.',
    })).toThrow('no longer available');
  });
});
