import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatQueuedPrompts from '../ChatQueuedPrompts.vue';
import ChatAnimatedDiffStat from '../ChatAnimatedDiffStat.vue';
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
  status: '{"source":"codex","action":"read","phase":"running","params":{"addedLines":2,"removedLines":1}}',
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
    expect(summary.text()).toContain('running read_file');

    const customStatus = mount(ChatToolCall, {
      props: {
        toolCall: { ...completedTool, status: 'Searched 3 files' },
      },
    });
    expect(customStatus.text()).toContain('Searched 3 files');

    const bare = mount(ChatToolCall, {
      props: {
        toolCall: { ...completedTool, args: undefined, result: undefined },
      },
    });
    await bare.get('.chat-tool-call__header').trigger('click');
    expect(bare.text()).not.toContain('Input');
    expect(bare.text()).not.toContain('Result');
  });

  it('renders grouped tools with running diff status and expands children', async () => {
    const wrapper = mount(ChatToolGroup, {
      props: {
        toolCalls: [completedTool, runningTool],
      },
    });

    expect(wrapper.text()).toContain('running read_file');
    expect(wrapper.text()).toContain('+2');
    expect(wrapper.text()).toContain('-1');
    await wrapper.get('.chat-tool-group__header').trigger('click');
    expect(wrapper.findAll('.chat-tool-call').length).toBeGreaterThanOrEqual(2);
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
