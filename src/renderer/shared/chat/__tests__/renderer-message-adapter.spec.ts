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
        {
          type: 'tool',
          id: 'tool-npm-test',
          kind: 'command',
          title: 'npm test',
          status: 'completed',
          body: '46 passed',
          input: { command: 'npm test' },
        },
      ],
      role: 'assistant',
      status: 'streaming',
    };

    expect(rendererMessageToChatMessage(rendererMessage)).toStrictEqual({
      content: 'Done.\n\nchecked workspace',
      createdAt: '2026-06-05T00:00:00.000Z',
      id: 'assistant-turn-1',
      parts: [
        { type: 'text', content: 'Done.' },
        { type: 'text', content: 'checked workspace' },
        {
          type: 'tool',
          toolCall: {
            args: { command: 'npm test' },
            done: true,
            function: 'npm test',
            id: 'tool-npm-test',
            result: '46 passed',
            state: 'completed',
            status: 'completed',
          },
        },
      ],
      role: 'assistant',
      streaming: true,
      toolCalls: [
        {
          args: { command: 'npm test' },
          done: true,
          function: 'npm test',
          id: 'tool-npm-test',
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
        { type: 'tool', id: 'tool-git-diff', kind: 'command', title: 'git diff', status: 'failed' },
      ],
      role: 'assistant',
      status: 'complete',
    };

    expect(rendererMessageToChatMessage(rendererMessage).toolCalls).toStrictEqual([
      {
        args: undefined,
        done: true,
        function: 'git diff',
        id: 'tool-git-diff',
        result: undefined,
        state: 'error',
        status: 'failed',
      },
    ]);
  });

  it('preserves ordered renderer parts so tools can render between text chunks', () => {
    const rendererMessage: RendererMessage = {
      agentId: 'agent-dina',
      createdAt: '2026-06-05T00:00:00.000Z',
      id: 'assistant-turn-ordered',
      parts: [
        { type: 'text', text: 'Before the read.' },
        {
          type: 'tool',
          id: 'tool-read',
          kind: 'command',
          title: 'cat docs/architecture.md',
          status: 'completed',
          body: 'architecture contents',
          input: { command: 'cat docs/architecture.md' },
        },
        { type: 'text', text: 'After the read.' },
      ],
      role: 'assistant',
      status: 'complete',
    };

    expect(rendererMessageToChatMessage(rendererMessage).parts).toStrictEqual([
      { type: 'text', content: 'Before the read.' },
      {
        type: 'tool',
        toolCall: {
          args: { command: 'cat docs/architecture.md' },
          done: true,
          function: 'cat docs/architecture.md',
          id: 'tool-read',
          result: 'architecture contents',
          state: 'completed',
          status: 'completed',
        },
      },
      { type: 'text', content: 'After the read.' },
    ]);
  });
});
