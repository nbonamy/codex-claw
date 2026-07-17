import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatComposerVoiceButton from '../ChatComposerVoiceButton.vue';

describe('ChatComposerVoiceButton', () => {
  it('renders its recording interface and emits toggles', async () => {
    const wrapper = mount(ChatComposerVoiceButton, {
      props: {
        disabled: false,
        label: 'Stop recording',
        recording: true,
        title: 'Stop recording',
      },
    });

    expect(wrapper.attributes('aria-label')).toBe('Stop recording');
    expect(wrapper.attributes('aria-pressed')).toBe('true');
    expect(wrapper.classes()).toContain('chat-composer__voice--recording');
    await wrapper.trigger('click');
    expect(wrapper.emitted('toggle')).toStrictEqual([[]]);
  });

  it('forwards disabled state', () => {
    const wrapper = mount(ChatComposerVoiceButton, {
      props: {
        disabled: true,
        label: 'Record voice prompt',
        recording: false,
        title: 'Audio recording is not available.',
      },
    });

    expect(wrapper.attributes('disabled')).toBeDefined();
    expect(wrapper.attributes('title')).toBe('Audio recording is not available.');
  });
});
