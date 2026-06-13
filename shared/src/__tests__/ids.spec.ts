import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEntityId, createUniqueEntityId } from '../ids';

describe('ids', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates prefixed entity ids', () => {
    expect(createEntityId('agent')).toMatch(/^agent-/);
  });

  it('creates unique prefixed ids with the default generator', () => {
    expect(createUniqueEntityId('agent', [])).toMatch(/^agent-/);
  });

  it('keeps generating until the id is unique', () => {
    const createId = vi.fn()
      .mockReturnValueOnce('agent-a')
      .mockReturnValueOnce('agent-b')
      .mockReturnValueOnce('agent-c');

    expect(createUniqueEntityId('agent', ['agent-a', 'agent-b'], createId)).toBe('agent-c');
    expect(createId).toHaveBeenCalledTimes(3);
  });

  it('falls back when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    vi.spyOn(Date, 'now').mockReturnValue(46_655);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    expect(createEntityId('agent')).toBe('agent-zzz-i');
  });
});
