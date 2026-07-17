import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatCompactionMessage from '../ChatCompactionMessage.vue';
import ChatMessage from '../ChatMessage.vue';
import ChatMessageEditor from '../ChatMessageEditor.vue';
import { i18n } from '../../../i18n';

const clipboardWriteText = vi.fn();

beforeEach(() => {
  clipboardWriteText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWriteText },
  });
  vi.stubGlobal('ClipboardItem', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mountMessage(props: Record<string, unknown>) {
  return mount(ChatMessage, {
    props: props as never,
    global: { plugins: [i18n] },
  });
}

describe('ChatMessage', () => {
  it('delegates compaction presentation to the dedicated component', () => {
    const wrapper = mountMessage({
      message: { role: 'assistant', content: '', compactionStatus: 'running', type: 'compaction' },
    });

    expect(wrapper.getComponent(ChatCompactionMessage).props()).toMatchObject({
      completedTitle: 'Context compacted',
      runningTitle: 'Compacting context',
      status: 'running',
    });
    expect(wrapper.find('.chat-message__thinking').exists()).toBe(false);
  });

  it('renders thinking for empty streaming assistant messages', () => {
    const wrapper = mountMessage({
      message: { role: 'assistant', content: '', streaming: true, toolCalls: [] },
    });

    expect(wrapper.text()).toContain('Thinking');
    expect(wrapper.get('.chat-message__thinking').classes()).toContain('text-shimmer');
  });

  it('hides unsupported user mutation actions while keeping copy and quote', () => {
    const wrapper = mountMessage({
      canDeleteMessage: false,
      canEditMessage: false,
      index: 0,
      message: { id: 'user-1', role: 'user', content: 'Inspect the composer.' },
    });

    expect(wrapper.find('[aria-label="Copy"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Quote"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Edit"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Delete"]').exists()).toBe(false);
  });

  it('hides unsupported assistant mutation actions while keeping copy', () => {
    const wrapper = mountMessage({
      canDeleteMessage: false,
      canRetryMessage: false,
      index: 1,
      message: { id: 'assistant-1', role: 'assistant', content: 'Checking now.' },
    });

    expect(wrapper.find('[aria-label="Copy"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Retry"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Delete"]').exists()).toBe(false);
  });

  it('routes user actions and editor output through its public events', async () => {
    const wrapper = mountMessage({
      index: 2,
      message: { role: 'user', content: 'Old prompt', createdAt: new Date().toISOString() },
    });

    await wrapper.find('[aria-label="Quote"]').trigger('click');
    await wrapper.find('[aria-label="Delete"]').trigger('click');
    await wrapper.find('[aria-label="Edit"]').trigger('click');
    wrapper.getComponent(ChatMessageEditor).vm.$emit('save', 'New prompt');
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('quote-message')).toStrictEqual([[2]]);
    expect(wrapper.emitted('delete-message')).toStrictEqual([[2]]);
    expect(wrapper.emitted('edit-message')).toStrictEqual([[{ content: 'New prompt', index: 2 }]]);
  });

  it('copies messages without tool markers or follow-up chips', async () => {
    const wrapper = mountMessage({
      index: 4,
      message: {
        role: 'assistant',
        content: 'Done.<tool id="tool-1"></tool>\n\n<follow-up>Do another thing</follow-up>',
      },
    });

    await wrapper.find('[aria-label="Copy"]').trigger('click');

    expect(clipboardWriteText).toHaveBeenCalledWith('Done.');
    expect(wrapper.emitted('copy-message')).toStrictEqual([[4]]);
  });

  it('renders assistant retry actions and reserves them while streaming', async () => {
    const wrapper = mountMessage({
      index: 5,
      message: { role: 'assistant', content: 'Answer', createdAt: new Date().toISOString() },
    });
    const streaming = mountMessage({
      message: { role: 'assistant', content: 'Answer', streaming: true },
    });

    expect(wrapper.find('[aria-label="Retry"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Delete"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Edit"]').exists()).toBe(false);
    await wrapper.find('[aria-label="Retry"]').trigger('click');
    await wrapper.find('[aria-label="Delete"]').trigger('click');
    expect(wrapper.emitted('retry-message')).toStrictEqual([[5]]);
    expect(wrapper.emitted('delete-message')).toStrictEqual([[5]]);
    expect(streaming.get('.chat-message__actions').classes()).toContain('chat-message__actions--reserved');
    expect(streaming.get('.chat-message__actions').attributes('aria-hidden')).toBe('true');
  });
});
