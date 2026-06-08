import { describe, expect, it } from 'vitest';
import { codexThreadHistoryToRendererMessages } from '../thread-history-adapter';
import type { CodexThread } from '../protocol';

describe('codexThreadHistoryToRendererMessages', () => {
  it('translates resumed Codex turns into renderer messages in item order', () => {
    const thread: CodexThread = {
      id: 'thread-resumed',
      cwd: '/Users/nbonamy/src/codex-claw',
      turns: [
        {
          id: 'turn-1',
          status: 'completed',
          startedAt: 1_780_000_000,
          completedAt: 1_780_000_010,
          items: [
            {
              type: 'userMessage',
              id: 'user-1',
              content: [
                {
                  type: 'text',
                  text: 'read README.md',
                  text_elements: [],
                },
              ],
            },
            {
              type: 'agentMessage',
              id: 'msg-1',
              text: 'I will read it.',
            },
            {
              type: 'commandExecution',
              id: 'cmd-read',
              command: 'sed -n "1,120p" README.md',
              cwd: '/Users/nbonamy/src/codex-claw',
              status: 'completed',
              commandActions: [
                {
                  type: 'read',
                  name: 'README.md',
                  cmd: 'sed -n "1,120p" README.md',
                },
              ],
              aggregatedOutput: '# Codex Claw',
              exitCode: 0,
              durationMs: 42,
            },
            {
              type: 'agentMessage',
              id: 'msg-2',
              text: 'Read README.md.',
            },
          ],
        },
      ],
    };

    expect(codexThreadHistoryToRendererMessages(thread, 'agent-dina')).toStrictEqual([
      {
        id: 'user-thread-resumed-turn-1-user-1',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-05-28T20:26:40.000Z',
        parts: [{ type: 'text', text: 'read README.md' }],
      },
      {
        id: 'assistant-turn-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-05-28T20:26:40.000Z',
        parts: [
          { type: 'text', text: 'I will read it.', itemId: 'msg-1' },
          {
            type: 'tool',
            id: 'cmd-read',
            kind: 'command',
            title: 'sed -n "1,120p" README.md',
            status: 'completed',
            statusText: '{"action":"read","phase":"completed","params":{"names":["README.md"],"target":"README.md"},"source":"codex"}',
            body: '# Codex Claw',
            input: {
              command: 'sed -n "1,120p" README.md',
              cwd: '/Users/nbonamy/src/codex-claw',
              commandActions: [
                {
                  type: 'read',
                  name: 'README.md',
                  cmd: 'sed -n "1,120p" README.md',
                },
              ],
            },
            output: {
              exitCode: 0,
              durationMs: 42,
            },
            metadata: {
              source: undefined,
              processId: undefined,
            },
          },
          { type: 'text', text: 'Read README.md.', itemId: 'msg-2' },
        ],
      },
    ]);
  });

  it('does not replay Codex plan items as normal assistant text', () => {
    const thread: CodexThread = {
      id: 'thread-resumed',
      cwd: '/Users/nbonamy/src/codex-claw',
      turns: [
        {
          id: 'turn-1',
          status: 'completed',
          startedAt: 1_780_000_000,
          completedAt: 1_780_000_010,
          items: [
            {
              type: 'userMessage',
              id: 'user-1',
              content: [
                {
                  type: 'text',
                  text: 'write a dummy false plan this is a test',
                  text_elements: [],
                },
              ],
            },
            {
              type: 'plan',
              id: 'turn-1-plan',
              text: '# Dummy False Plan\n\n- [ ] Do not implement\n',
            },
          ],
        },
      ],
    };

    expect(codexThreadHistoryToRendererMessages(thread, 'agent-dina')).toStrictEqual([
      {
        id: 'user-thread-resumed-turn-1-user-1',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-05-28T20:26:40.000Z',
        parts: [{ type: 'text', text: 'write a dummy false plan this is a test' }],
      },
    ]);
  });

  it('preserves mid-turn steering as a visible marker between assistant segments', () => {
    const thread: CodexThread = {
      id: 'thread-steered',
      cwd: '/Users/nbonamy/src/codex-claw',
      turns: [
        {
          id: 'turn-1',
          status: 'completed',
          startedAt: 1_780_000_000,
          completedAt: 1_780_000_010,
          items: [
            {
              type: 'userMessage',
              id: 'user-1',
              content: [
                {
                  type: 'text',
                  text: 'read all markdown files',
                  text_elements: [],
                },
              ],
            },
            {
              type: 'agentMessage',
              id: 'msg-1',
              text: 'I will inventory the Markdown files.',
            },
            {
              type: 'userMessage',
              id: 'steer-1',
              content: [
                {
                  type: 'text',
                  text: 'actually read them too',
                  text_elements: [],
                },
              ],
            },
            {
              type: 'agentMessage',
              id: 'msg-2',
              text: 'Reading them now.',
            },
          ],
        },
      ],
    };

    expect(codexThreadHistoryToRendererMessages(thread, 'agent-dina')).toStrictEqual([
      {
        id: 'user-thread-steered-turn-1-user-1',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-05-28T20:26:40.000Z',
        parts: [{ type: 'text', text: 'read all markdown files' }],
      },
      {
        id: 'assistant-turn-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-05-28T20:26:40.000Z',
        parts: [
          { type: 'text', text: 'I will inventory the Markdown files.', itemId: 'msg-1' },
        ],
      },
      {
        id: 'user-thread-steered-turn-1-steer-1',
        agentId: 'agent-dina',
        kind: 'steer',
        role: 'user',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-05-28T20:26:40.000Z',
        parts: [{ type: 'text', text: 'actually read them too' }],
      },
      {
        id: 'assistant-turn-1-segment-1',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-1',
        createdAt: '2026-05-28T20:26:40.000Z',
        parts: [
          { type: 'text', text: 'Reading them now.', itemId: 'msg-2' },
        ],
      },
    ]);
  });

  it('hydrates completed review output as assistant text instead of hidden tool output', () => {
    const thread: CodexThread = {
      id: 'thread-review',
      cwd: '/Users/nbonamy/src/codex-claw',
      turns: [
        {
          id: 'turn-review',
          status: 'completed',
          startedAt: 1_780_000_000,
          completedAt: 1_780_000_010,
          items: [
            {
              type: 'userMessage',
              id: 'user-review',
              content: [
                {
                  type: 'text',
                  text: 'current changes',
                  text_elements: [],
                },
              ],
            },
            {
              type: 'enteredReviewMode',
              id: 'review-1',
              review: 'current changes',
            },
            {
              type: 'exitedReviewMode',
              id: 'review-1',
              review: 'Found one issue.',
            },
          ],
        },
      ],
    };

    expect(codexThreadHistoryToRendererMessages(thread, 'agent-dina')).toStrictEqual([
      {
        id: 'user-thread-review-turn-review-user-review',
        agentId: 'agent-dina',
        role: 'user',
        status: 'complete',
        turnId: 'turn-review',
        createdAt: '2026-05-28T20:26:40.000Z',
        parts: [{ type: 'text', text: 'current changes' }],
      },
      {
        id: 'assistant-turn-review',
        agentId: 'agent-dina',
        role: 'assistant',
        status: 'complete',
        turnId: 'turn-review',
        createdAt: '2026-05-28T20:26:40.000Z',
        parts: [{ type: 'text', text: 'Found one issue.', itemId: 'review-1' }],
      },
    ]);
  });
});
