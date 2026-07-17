import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ChatComposerWaveform from '../../shared/chat/ChatComposerWaveform.vue';
import ChatComposerVoiceField from '../ChatComposerVoiceField.vue';

describe('ChatComposerVoiceField', () => {
  it('mounts the waveform while recording', () => {
    const wrapper = mount(ChatComposerVoiceField, {
      props: { recorder: null, recording: true },
      global: { stubs: { ChatComposerWaveform: true } },
    });

    expect(wrapper.findComponent(ChatComposerWaveform).exists()).toBe(true);
    expect(wrapper.text()).not.toContain('Transcribing...');
  });

  it('renders transcription status after recording stops', () => {
    const wrapper = mount(ChatComposerVoiceField, {
      props: { recorder: null, recording: false },
    });

    expect(wrapper.text()).toContain('Transcribing...');
    expect(wrapper.findComponent(ChatComposerWaveform).exists()).toBe(false);
  });
});
