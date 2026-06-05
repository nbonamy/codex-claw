import { mount } from '@vue/test-utils';
import { markRaw } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import ChatMessageBlock from '../ChatMessageBlock.vue';
import ChatMessage from '../ChatMessage.vue';
import ChatToolCallTitle from '../ChatToolCallTitle.vue';
import type { MessageBlock } from '../message-blocks';

afterEach(() => {
  document.body.innerHTML = '';
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
