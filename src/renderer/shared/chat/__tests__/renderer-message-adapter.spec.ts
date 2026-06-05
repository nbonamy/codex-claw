import { describe, expect, it } from 'vitest';
import { rendererMessageToChatMessage } from '../renderer-message-adapter';
import type { RendererMessage } from '../../../../shared/contracts';

describe('renderer message adapter', () => {
  it('maps Codex Claw renderer parts into id8-style chat messages without losing tool display data', () => {
    const rendererMessage: RendererMessage = {
      agentId: 'agent-dina',
      createdAt: '2026-06-05T00:00:00.000Z',
      id: 'assistant-turn-1',
      parts: [
        { type: 'text', text: 'Done.' },
        { type: 'status', text: 'checked workspace' },
        { type: 'tool', title: 'npm test', status: 'completed', body: '46 passed' },
      ],
      role: 'assistant',
      status: 'streaming',
    };

    expect(rendererMessageToChatMessage(rendererMessage)).toStrictEqual({
      content: 'Done.\n\nchecked workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      id: 'assistant-turn-1',
      role: 'assistant',
      streaming: true,
      toolCalls: [
        {
          args: { output: '46 passed' },
          done: true,
          function: 'npm test',
          id: 'assistant-turn-1-tool-0',
          result: '46 passed',
          state: 'completed',
          status: 'completed',
        },
      ],
      type: 'text',
    });
  });

  it('converts system messages to assistant display messages for the renderer stack', () => {
    const rendererMessage: RendererMessage = {
      agentId: 'agent-dina',
      createdAt: '2026-06-05T00:00:00.000Z',
      id: 'system-1',
      parts: [{ type: 'status', text: 'Codex app-server error' }],
      role: 'system',
      status: 'error',
    };

    expect(rendererMessageToChatMessage(rendererMessage).role).toBe('assistant');
    expect(rendererMessageToChatMessage(rendererMessage).content).toBe('Codex app-server error');
  });

  it('maps failed and bodyless tools into displayable tool calls', () => {
    const rendererMessage: RendererMessage = {
      agentId: 'agent-dina',
      createdAt: '2026-06-05T00:00:00.000Z',
      id: 'assistant-turn-2',
      parts: [
        { type: 'tool', title: 'git diff', status: 'failed' },
      ],
      role: 'assistant',
      status: 'complete',
    };

    expect(rendererMessageToChatMessage(rendererMessage).toolCalls).toStrictEqual([
      {
        args: undefined,
        done: true,
        function: 'git diff',
        id: 'assistant-turn-2-tool-0',
        result: undefined,
        state: 'error',
        status: 'failed',
      },
    ]);
  });
});
