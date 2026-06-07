import { describe, expect, it } from 'vitest';
import { claudeStreamTextDelta, claudeStreamToolInputDelta, claudeStreamToolUseStart, parseClaudeSdkMessage } from '../protocol';

describe('Claude protocol helpers', () => {
  it('extracts text deltas from partial stream events', () => {
    const message = parseClaudeSdkMessage(JSON.stringify({
      type: 'stream_event',
      session_id: 'claude-session-1',
      event: {
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: 'hello',
        },
      },
    }));

    expect(message).not.toBeNull();
    expect(message ? claudeStreamTextDelta(message) : '').toBe('hello');
  });

  it('ignores non-text stream events', () => {
    const message = parseClaudeSdkMessage(JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: {
          type: 'input_json_delta',
          partial_json: '{"command"',
        },
      },
    }));

    expect(message).not.toBeNull();
    expect(message ? claudeStreamTextDelta(message) : '').toBe('');
  });

  it('extracts streamed tool-use starts', () => {
    const message = parseClaudeSdkMessage(JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          id: 'tool-1',
          name: 'Bash',
          input: {},
        },
      },
    }));

    expect(message ? claudeStreamToolUseStart(message) : null).toStrictEqual({
      index: 1,
      id: 'tool-1',
      name: 'Bash',
      input: {},
    });
  });

  it('extracts streamed tool input JSON deltas', () => {
    const message = parseClaudeSdkMessage(JSON.stringify({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        index: 1,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"command":"npm test"}',
        },
      },
    }));

    expect(message ? claudeStreamToolInputDelta(message) : null).toStrictEqual({
      index: 1,
      partialJson: '{"command":"npm test"}',
    });
  });
});
