import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { describe, expect, it } from 'vitest';
import ChatComposer from '../ChatComposer.vue';
import type { CodexModelOption } from '../../../shared/contracts';

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

    await wrapper.get('textarea').trigger('keydown.enter');
    expect(wrapper.emitted('send')).toStrictEqual([['first line']]);
  });

  it('disables sending without text, without an agent, or while Codex is working', async () => {
    const empty = mountComposer();
    expect(empty.get('.chat-composer__send').attributes()).toHaveProperty('disabled');

    const disabled = mountComposer({ disabled: true });
    await disabled.get('textarea').setValue('hello');
    expect(disabled.get('.chat-composer__send').attributes()).toHaveProperty('disabled');

    const sending = mountComposer({ isSending: true });
    await sending.get('textarea').setValue('hello');
    expect(sending.get('.chat-composer__send').attributes()).toHaveProperty('disabled');
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
});

function mountComposer(overrides: Partial<ChatComposerProps & {
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
      plugins: [ElementPlus],
    },
  });
}
