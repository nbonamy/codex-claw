import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import ChatComposer from '../ChatComposer.vue';
import { i18n } from '../../i18n';
import type { AgentContextUsage, CodexModelOption } from '../../../shared/contracts';

type ChatComposerProps = {
  disabled: boolean;
  isSending: boolean;
  placeholder: string;
};

const models: CodexModelOption[] = [
  {
    id: 'codex-max',
    model: 'gpt-5.1-codex-max',
    displayName: 'GPT-5.1 Codex Max',
    description: 'Deep coding work',
    hidden: false,
    supportedReasoningEfforts: [
      { reasoningEffort: 'medium', description: 'Balanced' },
      { reasoningEffort: 'high', description: 'Deep reasoning' },
    ],
    defaultReasoningEffort: 'high',
    isDefault: true,
  },
];

describe('ChatComposer', () => {
  it('emits a trimmed prompt and clears the textarea', async () => {
    const wrapper = mountComposer();

    await wrapper.get('textarea').setValue('  ship the ui  ');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('send')).toStrictEqual([['ship the ui']]);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
  });

  it('sends from the shared send button', async () => {
    const wrapper = mountComposer();

    await wrapper.get('textarea').setValue('ship it');
    await wrapper.get('.chat-composer__send').trigger('click');

    expect(wrapper.emitted('send')).toStrictEqual([['ship it']]);
  });

  it('submits with Enter and preserves Shift Enter for multiline drafts', async () => {
    const wrapper = mountComposer();

    await wrapper.get('textarea').setValue('first line');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(wrapper.emitted('send')).toBeUndefined();

    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('send')).toStrictEqual([['first line']]);
  });

  it('steers with Command Enter', async () => {
    const wrapper = mountComposer({ isSending: true });

    await wrapper.get('textarea').setValue('switch to the smaller fix');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', metaKey: true });

    expect(wrapper.emitted('steer')).toStrictEqual([['switch to the smaller fix']]);
    expect(wrapper.emitted('send')).toBeUndefined();
  });

  it('disables sending without text or without an agent but keeps busy drafts submittable', async () => {
    const empty = mountComposer();
    expect(empty.get('.chat-composer__send').attributes()).toHaveProperty('disabled');

    const disabled = mountComposer({ disabled: true });
    await disabled.get('textarea').setValue('hello');
    expect(disabled.get('.chat-composer__send').attributes()).toHaveProperty('disabled');

    const sending = mountComposer({ isSending: true });
    await sending.get('textarea').setValue('hello');
    expect(sending.get('.chat-composer__send').attributes()).not.toHaveProperty('disabled');
    await sending.get('form').trigger('submit');
    expect(sending.emitted('send')).toStrictEqual([['hello']]);
  });

  it('renders selected Codex model and reasoning controls', () => {
    const wrapper = mountComposer({
      models,
      selectedModelId: 'codex-max',
      selectedReasoningEffort: 'high',
    });

    expect(wrapper.text()).toContain('GPT-5.1 Codex Max');
    expect(wrapper.text()).toContain('High');
  });

  it('shows context utilization when Codex reports token usage', () => {
    const wrapper = mountComposer({
      contextUsage: {
        totalTokens: 397_740,
        inputTokens: 40_000,
        cachedInputTokens: 10_000,
        outputTokens: 8_000,
        reasoningOutputTokens: 2_000,
        lastTotalTokens: 50_000,
        modelContextWindow: 200_000,
        usedPercent: 25,
      },
    });

    expect(wrapper.find('.chat-context-usage').exists()).toBe(true);
    expect(wrapper.find('.chat-context-usage').attributes('title')).toBeUndefined();
    expect(wrapper.find('.chat-context-usage__popover').text()).toContain('25% used (75% left)');
  });
});

function mountComposer(overrides: Partial<ChatComposerProps & {
  contextUsage: AgentContextUsage;
  models: CodexModelOption[];
  selectedModelId: string;
  selectedReasoningEffort: string;
}> = {}) {
  return mount(ChatComposer, {
    props: {
      disabled: false,
      isSending: false,
      placeholder: 'Ask for follow-up changes',
      ...overrides,
    },
    global: {
      plugins: [ElementPlus, i18n],
    },
  });
}
