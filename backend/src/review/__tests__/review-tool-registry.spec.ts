import { describe, expect, it } from 'vitest';
import { ReviewToolRegistry } from '../review-tool-registry';

describe('ReviewToolRegistry', () => {
  it('collects stable findings and verification in an agent-scoped review context', () => {
    const registry = new ReviewToolRegistry();
    const context = registry.create('agent-1');

    const first = context.reportFinding({
      fingerprint: 'src/auth.ts:ownership',
      priority: 'p1',
      summary: 'Ownership is not checked',
      rationale: 'The handler writes before authorizing.',
      suggestedResolution: 'Authorize before the write.',
    });
    const updated = context.reportFinding({
      fingerprint: 'src/auth.ts:ownership',
      priority: 'p0',
      summary: 'Ownership is not checked',
      rationale: 'The public handler writes before authorizing.',
      suggestedResolution: 'Authorize before the write.',
    });
    context.reportVerification({ findingId: 'prior-1', state: 'passed' });
    context.complete('One critical finding.');

    expect(updated.id).toBe(first.id);
    expect(registry.resolve('agent-2', context.id)).toBeNull();
    expect(registry.finish(context.id)).toEqual({
      findings: [expect.objectContaining({ id: first.id, priority: 'p0' })],
      verifications: [{ findingId: 'prior-1', state: 'passed' }],
      summary: 'One critical finding.',
    });
    expect(registry.resolve('agent-1', context.id)).toBeNull();
  });

  it('requires the reviewer to explicitly complete the round', () => {
    const registry = new ReviewToolRegistry();
    const context = registry.create('agent-1');

    expect(() => registry.finish(context.id)).toThrow('Reviewer did not complete');
  });
});
