import { describe, expect, it } from 'vitest';
import { isThreadFlags } from '../thread-flags';

describe('thread flags', () => {
  it('accepts only enabled predefined thread flags', () => {
    expect(isThreadFlags({ delegate_to_worktree: true })).toBe(true);
    expect(isThreadFlags({ ready_for_review: true, delegate_to_worktree: true })).toBe(true);
    expect(isThreadFlags({ delegate_to_worktree: false })).toBe(false);
    expect(isThreadFlags({ unknown: true })).toBe(false);
  });
});
