import { describe, expect, it } from 'vitest';
import { getToolFallbackTitle, getToolLineDiff, parseToolStatusDescriptor } from '../tool-status';
import type { MessageToolCall } from '../types';

describe('tool status helpers', () => {
  it('parses valid status descriptors and rejects invalid values', () => {
    expect(parseToolStatusDescriptor('not json')).toBeUndefined();
    expect(parseToolStatusDescriptor('{"source":"codex"}')).toBeUndefined();
    expect(parseToolStatusDescriptor('{"source":"codex","action":"edit","phase":"done","params":{"addedLines":4}}')).toStrictEqual({
      action: 'edit',
      phase: 'done',
      params: { addedLines: 4 },
      source: 'codex',
    });
    expect(parseToolStatusDescriptor('{"source":"codex","action":"edit","phase":"done","params":[]}')).toStrictEqual({
      action: 'edit',
      phase: 'done',
      params: undefined,
      source: 'codex',
    });
  });

  it('extracts line diffs from descriptor params', () => {
    expect(getToolLineDiff(undefined)).toBeUndefined();
    expect(getToolLineDiff({
      action: 'edit',
      phase: 'done',
      params: { addedLines: 3, removedLines: 1 },
      source: 'codex',
    })).toStrictEqual({ addedLines: 3, removedLines: 1 });
  });

  it('formats fallback titles by running state', () => {
    const tool: MessageToolCall = {
      args: undefined,
      function: 'npm test',
      id: 'tool',
      result: undefined,
      state: 'running',
    };

    expect(getToolFallbackTitle(tool)).toBe('Running npm test');
    expect(getToolFallbackTitle({ ...tool, done: true, state: 'completed' })).toBe('Ran npm test');
  });
});
