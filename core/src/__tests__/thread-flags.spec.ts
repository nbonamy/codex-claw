import { describe, expect, it } from 'vitest';
import { isThreadFlags, parseToggleThreadFlagInput } from '../thread-flags';

describe('thread flags', () => {
  it('accepts the predefined payload-free thread flags and boolean clearing', () => {
    expect(parseToggleThreadFlagInput({ id: 'delegate_to_worktree', value: true })).toStrictEqual({
      id: 'delegate_to_worktree',
      value: true,
    });
    expect(parseToggleThreadFlagInput({ id: 'delegate_to_worktree', value: false })).toStrictEqual({
      id: 'delegate_to_worktree',
      value: false,
    });
    expect(isThreadFlags({ delegate_to_worktree: true })).toBe(true);
    expect(parseToggleThreadFlagInput({ id: 'ready_for_review', value: true })).toStrictEqual({
      id: 'ready_for_review',
      value: true,
    });
    expect(isThreadFlags({ ready_for_review: true, delegate_to_worktree: true })).toBe(true);
  });

  it('rejects unknown flags, non-booleans, and payloads unsupported by the flag', () => {
    expect(() => parseToggleThreadFlagInput(null)).toThrow('Invalid thread flag input');
    expect(() => parseToggleThreadFlagInput({ id: 'show_button', value: true })).toThrow('allowed id');
    expect(() => parseToggleThreadFlagInput({ id: 'delegate_to_worktree', value: 'yes' })).toThrow('boolean');
    expect(() => parseToggleThreadFlagInput({ id: 'delegate_to_worktree', value: true, payload: {} })).toThrow('does not accept');
    expect(() => parseToggleThreadFlagInput({ id: 'ready_for_review', value: true, payload: {} })).toThrow('does not accept');
    expect(isThreadFlags({ delegate_to_worktree: false })).toBe(false);
  });
});
