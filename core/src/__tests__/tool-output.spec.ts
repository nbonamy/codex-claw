import { describe, expect, it } from 'vitest';
import { toolOutputText } from '../tool-output';

describe('tool output text', () => {
  it('normalizes scalar, array, and content-block output', () => {
    expect(toolOutputText(undefined)).toBeUndefined();
    expect(toolOutputText(null)).toBe('null');
    expect(toolOutputText(3)).toBe('3');
    expect(toolOutputText([])).toBeUndefined();
    expect(toolOutputText(['first', undefined, { text: 'second' }])).toBe('first\n\nsecond');
    expect(toolOutputText({ content: 'plain content' })).toBe('plain content');
    expect(toolOutputText({ content: [{ text: 'one' }, { content: 'two' }] })).toBe('one\n\ntwo');
    expect(toolOutputText({ arbitrary: true })).toBe('{"arbitrary":true}');
  });

  it('prefers structured content while preserving meaningful display text', () => {
    expect(toolOutputText({
      content: [{ text: 'Result returned in structuredContent.' }],
      structuredContent: { text: 'structured result' },
    })).toBe('structured result');
    expect(toolOutputText({
      content: [{ text: 'Visible summary' }],
      structuredContent: ['structured', { content: 'details' }],
    })).toBe('Visible summary\n\nstructured\n\ndetails');
    expect(toolOutputText({ structuredContent: '', text: 'fallback' })).toBe('fallback');
  });
});
