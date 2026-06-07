import { mount } from '@vue/test-utils';
import { markRaw } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatMessageBlock from '../ChatMessageBlock.vue';
import ChatMessage from '../ChatMessage.vue';
import ChatToolCall from '../ChatToolCall.vue';
import ChatToolGroup from '../ChatToolGroup.vue';
import ChatToolCallTitle from '../ChatToolCallTitle.vue';
import { i18n } from '../../../i18n';
import type { MessageBlock } from '../message-blocks';

const clipboardWriteText = vi.fn();

beforeEach(() => {
  clipboardWriteText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: clipboardWriteText,
    },
  });
  vi.stubGlobal('ClipboardItem', undefined);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ChatMessageBlock', () => {
  it.each([
    [{ type: 'user-text', content: 'hello `user`' }, 'hello'],
    [{ type: 'text', content: '**assistant** text' }, 'assistant'],
    [{ type: 'mermaid', code: 'graph TD\n  A[Start] --> B[Done]' }, 'Start'],
    [{ type: 'media', media: { title: 'Chart', url: 'https://example.com/chart.png' } }, 'Chart'],
    [{ type: 'follow-ups', prompts: ['Run coverage'] }, 'Run coverage'],
  ] satisfies Array<[MessageBlock, string]>)('renders %s blocks', (block, expectedText) => {
    const wrapper = mount(ChatMessageBlock, {
      props: { block },
    });

    expect(wrapper.text()).toContain(expectedText);
  });

  it('renders markdown links, tables, and code blocks with id8 classes', () => {
    const wrapper = mount(ChatMessageBlock, {
      props: {
        block: {
          content: [
            '[Docs](docs/architecture.md)',
            '',
            '| Name | Status |',
            '| --- | --- |',
            '| Dina | working |',
            '',
            '```ts',
            'const ok = true',
            '```',
          ].join('\n'),
          type: 'text',
        },
      },
    });

    expect(wrapper.get('a.chat-message-link').attributes('href')).toBe('docs/architecture.md');
    expect(wrapper.find('.chat-message-link__icon--file').exists()).toBe(true);
    expect(wrapper.find('table').exists()).toBe(true);
    expect(wrapper.find('th').text()).toBe('Name');
    expect(wrapper.find('pre code').text()).toContain('const ok = true');
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

  it('forwards tool cancellation and client response events', async () => {
    const tool = {
      args: { command: 'npm test' },
      done: false,
      function: 'npm test',
      id: 'tool-1',
      result: undefined,
      state: 'running' as const,
      status: JSON.stringify({
        action: 'run',
        phase: 'running',
        source: 'codex',
      }),
    };
    const response = {
      id: 'approval-1',
      payload: {
        decision: 'allow',
      },
    };
    const single = mount(ChatMessageBlock, {
      props: {
        block: { type: 'tool', toolCall: tool },
      },
    });

    single.getComponent(ChatToolCall).vm.$emit('cancel');
    single.getComponent(ChatToolCall).vm.$emit('client-response', response);
    await single.vm.$nextTick();

    expect(single.emitted('cancel')).toStrictEqual([[]]);
    expect(single.emitted('client-response')).toStrictEqual([[response]]);

    const group = mount(ChatMessageBlock, {
      props: {
        block: { type: 'tool-group', toolCalls: [tool] },
      },
    });

    group.getComponent(ChatToolGroup).vm.$emit('cancel');
    group.getComponent(ChatToolGroup).vm.$emit('client-response', response);
    await group.vm.$nextTick();

    expect(group.emitted('cancel')).toStrictEqual([[]]);
    expect(group.emitted('client-response')).toStrictEqual([[response]]);
  });

  it('renders mermaid blocks as SVG diagrams and toggles source code', async () => {
    const wrapper = mount(ChatMessageBlock, {
      props: {
        block: {
          code: [
            'graph TD',
            '  A[Start] --> B[Done]',
          ].join('\n'),
          type: 'mermaid',
        },
      },
    });

    expect(wrapper.find('.chat-mermaid-block__diagram svg').exists()).toBe(true);
    expect(wrapper.find('.chat-mermaid-block').text()).toContain('Start');
    expect(wrapper.find('.chat-mermaid-block').text()).toContain('Done');

    await wrapper.find('[aria-label="Show source"]').trigger('click');
    expect(wrapper.find('.chat-mermaid-block__diagram svg').exists()).toBe(false);
    expect(wrapper.find('.chat-mermaid-block__code').text()).toContain('graph TD');

    await wrapper.find('[aria-label="Render diagram"]').trigger('click');
    expect(wrapper.find('.chat-mermaid-block__diagram svg').exists()).toBe(true);
  });

  it('opens mermaid blocks fullscreen and closes with escape', async () => {
    const wrapper = mount(ChatMessageBlock, {
      props: {
        block: {
          code: [
            'graph TD',
            '  A[Start] --> B[Done]',
          ].join('\n'),
          type: 'mermaid',
        },
      },
    });

    await wrapper.find('[aria-label="Open fullscreen"]').trigger('click');
    expect(document.body.querySelector('.chat-mermaid-block__fullscreen .chat-mermaid-block__diagram svg')).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('.chat-mermaid-block__fullscreen')).toBeNull();
  });

  it('renders mermaid parser errors inside the diagram block', () => {
    const wrapper = mount(ChatMessageBlock, {
      props: {
        block: {
          code: 'not mermaid',
          type: 'mermaid',
        },
      },
    });

    expect(wrapper.find('.chat-mermaid-block__error').text()).toContain('Invalid');
  });

  it('keeps mermaid labels escaped when rendering SVG', () => {
    const wrapper = mount(ChatMessageBlock, {
      props: {
        block: {
          code: [
            'graph TD',
            '  A[<script>alert(1)</script>] --> B[Done]',
          ].join('\n'),
          type: 'mermaid',
        },
      },
    });

    expect(wrapper.find('.chat-mermaid-block__diagram svg').exists()).toBe(true);
    expect(wrapper.html()).not.toContain('<script>');
    expect(wrapper.html()).toContain('&lt;script&gt;');
  });

  it('renders media fallback labels and prompt details', async () => {
    const noCaption = mount(ChatMessageBlock, {
      props: {
        block: { type: 'media', media: { url: 'https://example.com/image.png' } },
      },
    });
    expect(noCaption.find('.chat-media-block__title').text()).toBe('Generated media');
    expect(noCaption.get('.chat-media-block__image').attributes('alt')).toBe('Generated media');
    expect(noCaption.find('[aria-label="Prompt"]').exists()).toBe(false);

    const promptCaption = mount(ChatMessageBlock, {
      props: {
        block: { type: 'media', media: { prompt: 'Draw the UI', url: 'https://example.com/image.png' } },
      },
    });
    await promptCaption.find('[aria-label="Prompt"]').trigger('click');
    expect(promptCaption.find('.chat-media-block__prompt').text()).toBe('Draw the UI');
  });

  it('opens media fullscreen and closes by clicking the backdrop', async () => {
    const wrapper = mount(ChatMessageBlock, {
      props: {
        block: {
          media: {
            alt: 'A bright product photo',
            title: 'A bright product photo',
            url: '/artifacts/image.png',
          },
          type: 'media',
        },
      },
    });

    expect(wrapper.find('[aria-label="Download media"]').attributes('download')).toBe('');

    await wrapper.find('.chat-media-block__image-button').trigger('click');

    const fullscreenImage = document.body.querySelector('.chat-media-block__fullscreen-image');
    expect(fullscreenImage?.getAttribute('src')).toBe('/artifacts/image.png');
    expect(fullscreenImage?.getAttribute('alt')).toBe('A bright product photo');

    document.body.querySelector<HTMLElement>('.chat-media-block__fullscreen')?.click();
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('.chat-media-block__fullscreen')).toBeNull();
  });
});

describe('ChatMessage', () => {
  it('hides unsupported user message mutation actions while keeping copy and quote', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        canDeleteMessage: false,
        canEditMessage: false,
        index: 0,
        message: {
          id: 'user-1',
          role: 'user',
          content: 'Please inspect the composer.',
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.find('[aria-label="Copy"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Quote"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Edit"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Delete"]').exists()).toBe(false);
  });

  it('hides unsupported assistant retry and delete actions while keeping copy', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        canDeleteMessage: false,
        canRetryMessage: false,
        index: 1,
        message: {
          id: 'assistant-1',
          role: 'assistant',
          content: 'I am checking it now.',
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.find('[aria-label="Copy"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Retry"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Delete"]').exists()).toBe(false);
  });
});

describe('ChatMessage', () => {
  it('renders running compaction messages with shimmer copy', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        message: { role: 'assistant', content: '', compactionStatus: 'running', type: 'compaction' },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.text()).toContain('Compacting context');
    expect(wrapper.get('.chat-message__compaction-title').classes()).not.toContain('text-shimmer');
    expect(wrapper.get('.chat-message__compaction-label').classes()).toContain('text-shimmer');
    expect(wrapper.find('.chat-message__thinking').exists()).toBe(false);
  });

  it('renders completed compaction messages without the running shimmer', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        message: { role: 'assistant', content: '', compactionStatus: 'completed', type: 'compaction' },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.text()).toContain('Context compacted');
    expect(wrapper.get('.chat-message__compaction-label').classes()).not.toContain('text-shimmer');
  });

  it('renders thinking for empty streaming assistant messages', () => {
    const wrapper = mount(ChatMessage, {
      props: {
        message: { role: 'assistant', content: '', streaming: true, toolCalls: [] },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.text()).toContain('Thinking');
    expect(wrapper.get('.chat-message__thinking').classes()).toContain('text-shimmer');
  });

  it('renders user copy, edit, quote, and delete actions', async () => {
    const wrapper = mount(ChatMessage, {
      props: {
        index: 2,
        message: { role: 'user', content: 'Old prompt', createdAt: new Date().toISOString() },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.find('[aria-label="Copy"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Edit"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Quote"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Delete"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Retry"]').exists()).toBe(false);
    expect(wrapper.find('.chat-message-actions__sent-at').exists()).toBe(true);
    expect(wrapper.find('.chat-message-actions').element.firstElementChild?.classList.contains('chat-message-actions__sent-at')).toBe(true);

    await wrapper.find('[aria-label="Quote"]').trigger('click');
    await wrapper.find('[aria-label="Delete"]').trigger('click');
    await wrapper.find('[aria-label="Edit"]').trigger('click');
    await wrapper.get('.chat-message__edit-input').setValue('  New prompt  ');
    await wrapper.get('.chat-message__edit-button--primary').trigger('click');

    expect(wrapper.emitted('quote-message')).toStrictEqual([[2]]);
    expect(wrapper.emitted('delete-message')).toStrictEqual([[2]]);
    expect(wrapper.emitted('edit-message')).toStrictEqual([[{ content: 'New prompt', index: 2 }]]);
  });

  it('copies messages without tool markers or follow-up chips', async () => {
    const wrapper = mount(ChatMessage, {
      props: {
        index: 4,
        message: {
          role: 'assistant',
          content: 'Done.<tool id="tool-1"></tool>\n\n<follow-up>Do another thing</follow-up>',
        },
      },
      global: {
        plugins: [i18n],
      },
    });

    await wrapper.find('[aria-label="Copy"]').trigger('click');

    expect(clipboardWriteText).toHaveBeenCalledWith('Done.');
    expect(wrapper.emitted('copy-message')).toStrictEqual([[4]]);
  });

  it('renders assistant retry actions and reserves them while streaming', async () => {
    const wrapper = mount(ChatMessage, {
      props: {
        index: 5,
        message: { role: 'assistant', content: 'Answer', createdAt: new Date().toISOString() },
      },
      global: {
        plugins: [i18n],
      },
    });
    const streaming = mount(ChatMessage, {
      props: {
        message: { role: 'assistant', content: 'Answer', streaming: true },
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.find('[aria-label="Retry"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Delete"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Edit"]').exists()).toBe(false);
    expect(wrapper.find('.chat-message-actions').element.lastElementChild?.classList.contains('chat-message-actions__sent-at')).toBe(true);
    await wrapper.find('[aria-label="Retry"]').trigger('click');
    await wrapper.find('[aria-label="Delete"]').trigger('click');
    expect(wrapper.emitted('retry-message')).toStrictEqual([[5]]);
    expect(wrapper.emitted('delete-message')).toStrictEqual([[5]]);
    expect(streaming.get('.chat-message__actions').classes()).toContain('chat-message__actions--reserved');
    expect(streaming.get('.chat-message__actions').attributes('aria-hidden')).toBe('true');
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
