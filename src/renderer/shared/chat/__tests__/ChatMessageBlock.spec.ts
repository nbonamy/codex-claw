import { mount } from '@vue/test-utils';
import { markRaw } from 'vue';
import { describe, expect, it } from 'vitest';
import ChatMessageBlock from '../ChatMessageBlock.vue';
import ChatMessage from '../ChatMessage.vue';
import ChatToolCallTitle from '../ChatToolCallTitle.vue';
import type { MessageBlock } from '../message-blocks';

describe('ChatMessageBlock', () => {
  it.each([
    [{ type: 'user-text', content: 'hello `user`' }, 'hello'],
    [{ type: 'text', content: '**assistant** text' }, 'assistant'],
    [{ type: 'mermaid', code: 'graph TD; A-->B;' }, 'graph TD; A-->B;'],
    [{ type: 'media', media: { title: 'Chart', url: 'https://example.com/chart.png' } }, 'Chart'],
    [{ type: 'follow-ups', prompts: ['Run coverage'] }, 'Run coverage'],
  ] satisfies Array<[MessageBlock, string]>)('renders %s blocks', (block, expectedText) => {
    const wrapper = mount(ChatMessageBlock, {
      props: { block },
    });

    expect(wrapper.text()).toContain(expectedText);
  });

  it('emits follow-up prompts from follow-up blocks', async () => {
    const wrapper = mount(ChatMessageBlock, {
      props: {
        block: { type: 'follow-ups', prompts: ['Continue'] },
      },
    });

    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('send-follow-up')).toStrictEqual([['Continue']]);
  });

  it('renders single tools and tool groups', async () => {
    const tool = {
      args: { command: 'npm test' },
      done: true,
      function: 'npm test',
      id: 'tool-1',
      result: 'passed',
      state: 'completed' as const,
      status: 'completed',
    };
    const single = mount(ChatMessageBlock, {
      props: {
        block: { type: 'tool', toolCall: tool },
      },
    });
    expect(single.text()).toContain('Ran npm test');

    const group = mount(ChatMessageBlock, {
      props: {
        block: { type: 'tool-group', toolCalls: [tool, { ...tool, id: 'tool-2', function: 'git status' }] },
      },
    });
    expect(group.text()).toContain('2 actions done');
  });

  it('renders media fallback labels without captions and prompt captions', () => {
    const noCaption = mount(ChatMessageBlock, {
      props: {
        block: { type: 'media', media: { url: 'https://example.com/image.png' } },
      },
    });
    expect(noCaption.find('figcaption').exists()).toBe(false);
    expect(noCaption.get('img').attributes('alt')).toBe('Generated media');

    const promptCaption = mount(ChatMessageBlock, {
      props: {
        block: { type: 'media', media: { prompt: 'Draw the UI', url: 'https://example.com/image.png' } },
      },
    });
    expect(promptCaption.text()).toContain('Draw the UI');
  });
});

describe('ChatMessage', () => {
  it('renders compaction messages', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        message: { role: 'assistant', content: '', type: 'compaction' },
      },
    });

    expect(wrapper.text()).toContain('Automatically compacting context');
  });

  it('renders thinking for empty streaming assistant messages', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        message: { role: 'assistant', content: '', streaming: true, toolCalls: [] },
      },
    });

    expect(wrapper.text()).toContain('Thinking');
  });
});

describe('ChatToolCallTitle', () => {
  it('renders running titles with line diffs', () => {
    const Icon = markRaw({
      template: '<svg data-test="tool-icon" />',
    });
    const wrapper = mount(ChatToolCallTitle, {
      props: {
        icon: Icon,
        lineDiff: { addedLines: 4, removedLines: 2 },
        running: true,
        title: 'editing files',
      },
    });

    expect(wrapper.text()).toContain('editing files');
    expect(wrapper.text()).toContain('+4');
    expect(wrapper.text()).toContain('-2');
    expect(wrapper.find('[data-test="tool-icon"]').exists()).toBe(true);
  });

  it('renders remove-only diffs', () => {
    const wrapper = mount(ChatToolCallTitle, {
      props: {
        lineDiff: { addedLines: 0, removedLines: 3 },
        title: 'removed lines',
      },
    });

    expect(wrapper.text()).toContain('-3');
    expect(wrapper.text()).not.toContain('+');
  });

  it('omits diff markup when no diff is provided', () => {
    const wrapper = mount(ChatToolCallTitle, {
      props: {
        title: 'searched files',
      },
    });

    expect(wrapper.text()).toContain('searched files');
    expect(wrapper.find('.chat-tool-call__diff').exists()).toBe(false);
  });
});
