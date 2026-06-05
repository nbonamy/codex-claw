import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatComposer from '../ChatComposer.vue';

type ChatComposerProps = {
  disabled: boolean;
  isSending: boolean;
  placeholder: string;
};

describe('ChatComposer', () => {
  it('emits a trimmed prompt and clears the textarea', async () => {
    const wrapper = mountComposer();

    await wrapper.get('textarea').setValue('  ship the ui  ');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('send')).toStrictEqual([['ship the ui']]);
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('');
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
    expect(empty.get('button[type="submit"]').attributes()).toHaveProperty('disabled');

    const disabled = mountComposer({ disabled: true });
    await disabled.get('textarea').setValue('hello');
    expect(disabled.get('button[type="submit"]').attributes()).toHaveProperty('disabled');

    const sending = mountComposer({ isSending: true });
    await sending.get('textarea').setValue('hello');
    expect(sending.get('button[type="submit"]').attributes()).toHaveProperty('disabled');
  });
});

function mountComposer(overrides: Partial<ChatComposerProps> = {}) {
  return mount(ChatComposer, {
    props: {
      disabled: false,
      isSending: false,
      placeholder: 'Ask for follow-up changes',
      ...overrides,
    },
  });
}
