import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatQueuedPrompts from '../ChatQueuedPrompts.vue';
import ChatAnimatedDiffStat from '../ChatAnimatedDiffStat.vue';
import ChatToolConfirmation from '../ChatToolConfirmation.vue';
import ChatToolCall from '../ChatToolCall.vue';
import ChatToolGroup from '../ChatToolGroup.vue';
import type { MessageToolCall } from '../types';

const completedTool: MessageToolCall = {
  args: { command: 'npm test' },
  done: true,
  function: 'npm test',
  id: 'tool-1',
  result: '46 passed',
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
  status: '{"source":"codex","action":"read","phase":"running","params":{"addedLines":2,"removedLines":1,"target":"src/main.ts"}}',
};

const confirmationTool: MessageToolCall = {
  args: { agentId: 'agent-dina' },
  done: false,
  function: 'codex_claw.register-agent',
  id: 'approval-tool',
  result: undefined,
  state: 'running',
  status: JSON.stringify({
    source: 'mcp',
    action: 'run',
    phase: 'running',
    params: {
      allowAlways: true,
      allowConversation: true,
      argumentsPreview: '{\n  "agentId": "agent-dina"\n}',
      confirmationSummary: 'Allow codex_claw to register this agent?',
      requestId: 'approval-1',
    },
  }),
};

const editingTool: MessageToolCall = {
  args: { changes: [{ path: 'src/main/codex/tool-part-adapter.ts' }] },
  done: false,
  function: '1 file change',
  id: 'tool-edit',
  result: undefined,
  state: 'running',
  status: JSON.stringify({
    source: 'codex',
    action: 'edit',
    phase: 'running',
    params: {
      addedLines: 134,
      path: 'src/main/codex/tool-part-adapter.ts',
      removedLines: 1,
      target: 'tool-part-adapter.ts',
    },
  }),
};

describe('ported id8 chat components', () => {
  it('normalizes invalid animated diff values', () => {
    const wrapper = mount(ChatAnimatedDiffStat, {
      props: {
        label: 'Added lines',
        sign: '+',
        value: Number.NaN,
      },
    });

    expect(wrapper.text()).toContain('+0');
    expect(wrapper.attributes('aria-label')).toBe('Added lines: +0');
  });

  it('renders queued prompts and emits deletes', async () => {
    const wrapper = mount(ChatQueuedPrompts, {
      props: {
        prompts: [{ id: 'prompt-1', text: 'Run the tests after this turn' }],
      },
    });

    expect(wrapper.text()).toContain('Run the tests after this turn');
    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('delete')).toStrictEqual([['prompt-1']]);
  });

  it('renders collapsible tool calls with params and result', async () => {
    const wrapper = mount(ChatToolCall, {
      props: {
        toolCall: completedTool,
      },
    });

    expect(wrapper.text()).toContain('Ran npm test');
    await wrapper.get('.chat-tool-call__header').trigger('click');
    expect(wrapper.text()).toContain('Input');
    expect(wrapper.text()).toContain('Result');
    expect(wrapper.text()).toContain('46 passed');

    const structuredResult = mount(ChatToolCall, {
      props: {
        toolCall: {
          ...completedTool,
          function: 'codex_claw.set-status',
          result: {
            agentId: 'agent-dina',
            status: 'Registered and idle',
          },
        },
      },
    });
    await structuredResult.get('.chat-tool-call__header').trigger('click');
    expect(structuredResult.text()).toContain('"status": "Registered and idle"');
  });

  it('renders headerless, summary-only, descriptor, and bare tool states', async () => {
    const headerless = mount(ChatToolCall, {
      props: {
        headerless: true,
        toolCall: completedTool,
      },
    });
    expect(headerless.text()).toContain('Input');
    expect(headerless.find('.chat-tool-call__header').exists()).toBe(false);

    const summary = mount(ChatToolCall, {
      props: {
        summaryOnly: true,
        toolCall: runningTool,
      },
    });
    expect(summary.text()).toContain('Reading src/main.ts');

    const customStatus = mount(ChatToolCall, {
      props: {
        toolCall: { ...completedTool, status: 'Searched 3 files' },
      },
    });
    expect(customStatus.text()).toContain('Searched 3 files');

    const completedRead = mount(ChatToolCall, {
      props: {
        toolCall: {
          ...completedTool,
          function: '/bin/bash -lc "sed -n 1,220p README.md"',
          status: '{"source":"codex","action":"read","phase":"completed","params":{"target":"README.md"}}',
        },
      },
    });
    expect(completedRead.text()).toContain('Read README.md');

    const editing = mount(ChatToolCall, {
      props: {
        summaryOnly: true,
        toolCall: editingTool,
      },
    });
    expect(editing.text()).toContain('Editing');
    expect(editing.find('.chat-tool-call__title-target').text()).toBe('tool-part-adapter.ts');
    expect(editing.find('.chat-tool-call__diff-add').text()).toBe('+134');
    expect(editing.find('.chat-tool-call__diff-delete').text()).toBe('-1');

    const bare = mount(ChatToolCall, {
      props: {
        toolCall: { ...completedTool, args: undefined, result: undefined },
      },
    });
    await bare.get('.chat-tool-call__header').trigger('click');
    expect(bare.text()).not.toContain('Input');
    expect(bare.text()).not.toContain('Result');

    const nullResult = mount(ChatToolCall, {
      props: {
        toolCall: { ...runningTool, args: undefined, result: null },
      },
    });
    await nullResult.get('.chat-tool-call__header').trigger('click');
    expect(nullResult.text()).not.toContain('Result');
  });

  it('renders grouped tools with running diff status and expands children', async () => {
    const wrapper = mount(ChatToolGroup, {
      props: {
        toolCalls: [completedTool, runningTool],
      },
    });

    expect(wrapper.text()).toContain('Reading src/main.ts');
    expect(wrapper.text()).toContain('+2');
    expect(wrapper.text()).toContain('-1');
    await wrapper.get('.chat-tool-group__header').trigger('click');
    expect(wrapper.findAll('.chat-tool-call').length).toBeGreaterThanOrEqual(2);
  });

  it('renders MCP tool confirmations and emits the selected decision', async () => {
    const wrapper = mount(ChatToolConfirmation, {
      props: {
        toolCall: confirmationTool,
      },
    });

    expect(wrapper.text()).toContain('Approve tool call');
    expect(wrapper.text()).toContain('Allow codex_claw to register this agent?');
    expect(wrapper.text()).toContain('Allow for session');
    expect(wrapper.text()).toContain('Always allow');

    await wrapper.get('.chat-tool-confirmation__button--primary').trigger('click');

    expect(wrapper.emitted('client-response')).toStrictEqual([
      [
        {
          id: 'approval-1',
          payload: {
            decision: 'allow',
          },
        },
      ],
    ]);
    expect(wrapper.text()).toContain('Allowed tool call');
  });

  it('renders fallback confirmation copy without persistent actions', () => {
    const wrapper = mount(ChatToolConfirmation, {
      props: {
        toolCall: {
          args: undefined,
          done: false,
          function: 'codex_claw.check-messages',
          id: 'approval-tool-minimal',
          result: undefined,
          state: 'running',
          status: JSON.stringify({
            source: 'mcp',
            action: 'run',
            phase: 'running',
            params: {
              requestId: 'approval-minimal',
            },
          }),
        },
      },
    });

    expect(wrapper.text()).toContain('Allow tool call codex_claw.check-messages?');
    expect(wrapper.text()).not.toContain('Allow for session');
    expect(wrapper.text()).not.toContain('Always allow');
    expect(wrapper.find('.chat-tool-confirmation__details').exists()).toBe(false);
  });

  it('marks externally answered confirmations as resolved', async () => {
    const wrapper = mount(ChatToolConfirmation, {
      props: {
        answeredClientRequestIds: new Set(['approval-1']),
        toolCall: confirmationTool,
      },
    });

    expect(wrapper.text()).toContain('Allowed tool call');
    expect(wrapper.find('.chat-tool-confirmation__button--primary').exists()).toBe(false);
    expect(wrapper.emitted('client-response')).toBeUndefined();
  });

  it('renders denied confirmation decisions as resolved', async () => {
    const wrapper = mount(ChatToolConfirmation, {
      props: {
        toolCall: confirmationTool,
      },
    });

    const denyButton = wrapper
      .findAll('.chat-tool-confirmation__button')
      .find((button) => button.text() === 'Deny');
    expect(denyButton).toBeTruthy();
    await denyButton?.trigger('click');

    expect(wrapper.emitted('client-response')).toStrictEqual([
      [
        {
          id: 'approval-1',
          payload: {
            decision: 'deny',
          },
        },
      ],
    ]);
    expect(wrapper.text()).toContain('Denied tool call');
  });

  it('ignores confirmation clicks without a request id', async () => {
    const wrapper = mount(ChatToolConfirmation, {
      props: {
        toolCall: {
          ...confirmationTool,
          status: JSON.stringify({
            source: 'mcp',
            action: 'run',
            phase: 'running',
            params: {},
          }),
        },
      },
    });

    await wrapper.get('.chat-tool-confirmation__button--primary').trigger('click');

    expect(wrapper.emitted('client-response')).toBeUndefined();
  });

  it('switches running confirmation-style tools to the confirmation renderer', () => {
    const wrapper = mount(ChatToolCall, {
      props: {
        toolCall: confirmationTool,
      },
    });

    expect(wrapper.find('.chat-tool-confirmation').exists()).toBe(true);
    expect(wrapper.find('.chat-tool-call').exists()).toBe(false);
  });

  it('does not wrap a single confirmation tool group in a collapsible header', () => {
    const wrapper = mount(ChatToolGroup, {
      props: {
        toolCalls: [confirmationTool],
      },
    });

    expect(wrapper.find('.chat-tool-confirmation').exists()).toBe(true);
    expect(wrapper.find('.chat-tool-group__header').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Running codex_claw.register-agent');
  });

  it('summarizes completed tool groups and handles an empty group', async () => {
    const completed = mount(ChatToolGroup, {
      props: {
        toolCalls: [completedTool],
      },
    });

    expect(completed.text()).toContain('Ran npm test');
    await completed.get('.chat-tool-group__header').trigger('click');
    expect(completed.text()).toContain('Input');

    const empty = mount(ChatToolGroup, {
      props: {
        toolCalls: [],
      },
    });

    expect(empty.text()).toContain('No actions');
  });
});
