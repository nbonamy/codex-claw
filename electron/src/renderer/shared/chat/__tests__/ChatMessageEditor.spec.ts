import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatMessageEditor from '../ChatMessageEditor.vue';

function mountEditor(content = 'Old prompt') {
  return mount(ChatMessageEditor, {
    props: {
      cancelLabel: 'Cancel',
      content,
      inputLabel: 'Edit prompt',
      saveLabel: 'Resubmit',
    },
  });
}

describe('ChatMessageEditor', () => {
  it('owns its draft and emits trimmed saves', async () => {
    const wrapper = mountEditor();
    expect(wrapper.get('textarea').attributes('aria-label')).toBe('Edit prompt');

    await wrapper.get('textarea').setValue('  New prompt  ');
    await wrapper.get('.chat-message__edit-button--primary').trigger('click');

    expect(wrapper.emitted('save')).toStrictEqual([['New prompt']]);
  });

  it('updates from its content interface and rejects blank saves', async () => {
    const wrapper = mountEditor();
    await (wrapper as unknown as {
      setProps(props: { content: string }): Promise<void>
    }).setProps({ content: 'Updated externally' });
    expect(wrapper.get<HTMLTextAreaElement>('textarea').element.value).toBe('Updated externally');

    await wrapper.get('textarea').setValue('   ');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter', metaKey: true });
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('emits cancellation from its button and keyboard interface', async () => {
    const wrapper = mountEditor();
    await wrapper.get('.chat-message__edit-button').trigger('click');
    await wrapper.get('textarea').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('cancel')).toStrictEqual([[], []]);
  });
});
