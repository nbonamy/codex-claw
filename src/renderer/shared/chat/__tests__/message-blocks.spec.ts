import { describe, expect, it } from 'vitest';
import { computeMessageBlocks, groupToolBlocks, stripMessageContext } from '../message-blocks';
import type { Message, MessageToolCall } from '../types';

const completedTool: MessageToolCall = {
  args: { command: 'npm test' },
  done: true,
  function: 'shell',
  id: 'tool-1',
  result: { output: 'passed' },
  state: 'completed',
  status: 'completed',
};

const runningTool: MessageToolCall = {
  args: { path: 'src/main.ts' },
  done: false,
  function: 'read_file',
  id: 'tool-2',
  result: undefined,
  state: 'running',
  status: '{"source":"codex","action":"read","phase":"running","params":{"addedLines":2,"removedLines":1}}',
};

describe('message block computation', () => {
  it('strips hidden context from user messages', () => {
    expect(stripMessageContext('<context>secret</context>\nvisible')).toBe('visible');
    expect(computeMessageBlocks({ role: 'user', content: '<context>x</context>\nhello' })).toStrictEqual([
      { type: 'user-text', content: 'hello' },
    ]);
  });

  it('returns no blocks for empty assistant messages without tools', () => {
    expect(computeMessageBlocks({ role: 'user', content: '' })).toStrictEqual([]);
    expect(computeMessageBlocks({ role: 'assistant', content: '' })).toStrictEqual([]);
  });

  it('extracts text, follow-ups, mermaid, images, anchored tools, and grouped trailing tools', () => {
    const blocks = computeMessageBlocks({
      role: 'assistant',
      content: [
        'Here is the result.',
        '<tool id="tool-1"></tool>',
        '```mermaid',
        'graph TD; A-->B;',
        '```',
        '![chart](file:///tmp/chart.png "Chart")',
        '<follow-up>Open the diff</follow-up>',
      ].join('\n'),
      toolCalls: [completedTool, runningTool],
    });

    expect(blocks.map((block) => block.type)).toStrictEqual([
      'text',
      'tool-group',
      'mermaid',
      'media',
      'tool-group',
      'follow-ups',
    ]);
    expect(blocks.at(-1)).toStrictEqual({ type: 'follow-ups', prompts: ['Open the diff'] });
  });

  it('uses ordered message parts to place Codex tool calls between text chunks', () => {
    const blocks = computeMessageBlocks({
      role: 'assistant',
      content: 'Before the read.\n\nAfter the read.',
      parts: [
        { type: 'text', content: 'Before the read.' },
        { type: 'tool', toolCall: completedTool },
        { type: 'text', content: 'After the read.' },
      ],
      toolCalls: [completedTool],
    });

    expect(blocks).toStrictEqual([
      { type: 'text', content: 'Before the read.' },
      { type: 'tool-group', toolCalls: [completedTool] },
      { type: 'text', content: 'After the read.' },
    ]);
  });

  it('completes partial streaming follow-up and tool tags', () => {
    const blocks = computeMessageBlocks({
      role: 'assistant',
      content: 'Pick one <follow-up>Continue</',
      streaming: true,
    } as Message);

    expect(blocks).toStrictEqual([
      { type: 'text', content: 'Pick one ' },
      { type: 'follow-ups', prompts: ['Continue'] },
    ]);

    expect(computeMessageBlocks({
      role: 'assistant',
      content: '<tool index="0"',
      toolCalls: [completedTool],
    }).map((block) => block.type)).toStrictEqual(['tool-group']);

    expect(computeMessageBlocks({
      role: 'assistant',
      content: 'broken <tool',
      toolCalls: [completedTool],
    }).map((block) => block.type)).toStrictEqual(['text', 'tool-group']);

    expect(computeMessageBlocks({
      role: 'assistant',
      content: '<tool index="bad"></tool>',
      toolCalls: [completedTool],
    }).map((block) => block.type)).toStrictEqual(['tool-group']);
  });

  it('keeps ask-user and running confirmation-style tools ungrouped', () => {
    const askTool: MessageToolCall = {
      ...runningTool,
      function: 'ask_user_question',
      id: 'ask',
      status: 'running',
    };
    const mcpTool: MessageToolCall = {
      ...runningTool,
      id: 'mcp',
      status: '{"source":"mcp","action":"confirm","phase":"pending","params":{"requestId":"r1"}}',
    };

    expect(groupToolBlocks([
      { type: 'tool', toolCall: completedTool },
      { type: 'tool', toolCall: askTool },
      { type: 'tool', toolCall: mcpTool },
    ])).toStrictEqual([
      { type: 'tool-group', toolCalls: [completedTool] },
      { type: 'tool', toolCall: askTool },
      { type: 'tool', toolCall: mcpTool },
    ]);
  });

  it('ignores special blocks inside code fences and handles media tool prompts', () => {
    const imageTool: MessageToolCall = {
      args: { prompt: 'draw app' },
      done: true,
      function: 'image_generation',
      id: 'image-tool',
      result: { url: 'https://example.com/image.png' },
      state: 'completed',
      status: 'completed',
    };

    const blocks = computeMessageBlocks({
      role: 'assistant',
      content: [
        '```',
        '<tool id="image-tool"></tool>',
        '![ignored](https://example.com/ignored.png)',
        '```',
        '![actual](https://example.com/image.png)',
      ].join('\n'),
      toolCalls: [imageTool],
    });

    expect(blocks.map((block) => block.type)).toStrictEqual(['text', 'media']);
    expect(blocks[1]).toStrictEqual({
      type: 'media',
      media: {
        alt: 'actual',
        prompt: 'draw app',
        title: 'actual',
        url: 'https://example.com/image.png',
      },
      toolCall: imageTool,
    });
  });
});
