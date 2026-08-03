import { flushPromises, mount } from '@vue/test-utils';
import { computed, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const voiceMock = vi.hoisted(() => ({
  isRecording: null as { value: boolean } | null,
  isTranscribing: null as { value: boolean } | null,
  onTranscript: null as ((text: string) => void) | null,
  stop: vi.fn<() => Promise<boolean>>(),
  toggle: vi.fn<() => Promise<void>>(),
}));

vi.mock('codex-app-sdk/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('codex-app-sdk/vue')>();
  const isRecording = ref(false);
  const isTranscribing = ref(false);
  voiceMock.isRecording = isRecording;
  voiceMock.isTranscribing = isTranscribing;
  voiceMock.toggle.mockImplementation(async () => {
    isRecording.value = !isRecording.value;
  });
  return {
    ...actual,
    getCodexNativeRendererApi: () => ({ capabilities: { transcription: true } }),
    useCodexComposerVoice: (options: { onTranscript(text: string): void }) => {
      voiceMock.onTranscript = options.onTranscript;
      return {
        buttonDisabled: computed(() => isTranscribing.value),
        buttonLabel: computed(() => isRecording.value ? 'Stop recording' : 'Record voice prompt'),
        buttonTitle: computed(() => isTranscribing.value ? 'Transcribing...' : 'Record voice prompt'),
        error: ref(null),
        isRecording,
        isTranscribing,
        recorder: computed(() => null),
        stop: voiceMock.stop,
        toggle: voiceMock.toggle,
        dispose: vi.fn(),
      };
    },
  };
});

import AnnotationPopup from '../AnnotationPopup.vue';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D);
  if (voiceMock.isRecording) voiceMock.isRecording.value = false;
  if (voiceMock.isTranscribing) voiceMock.isTranscribing.value = false;
  voiceMock.onTranscript = null;
  voiceMock.toggle.mockReset();
  voiceMock.toggle.mockImplementation(async () => {
    voiceMock.isRecording!.value = !voiceMock.isRecording!.value;
  });
  voiceMock.stop.mockReset();
  voiceMock.stop.mockImplementation(async () => {
    if (!voiceMock.isRecording!.value) return false;
    voiceMock.isRecording!.value = false;
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AnnotationPopup', () => {
  it('positions itself from its host-provided anchor and returns trimmed input', async () => {
    const wrapper = mount(AnnotationPopup, {
      props: {
        anchor: { x: 48, y: 80, width: 120, height: 32 },
        description: 'Google Search',
      },
    });

    expect(wrapper.get('form').attributes('style')).toContain('left: 48px');
    expect(wrapper.get('form').attributes('style')).toContain('top: 120px');
    expect(wrapper.get('form').attributes('aria-description')).toBe('Google Search');

    await wrapper.get('input').setValue('  Make this clearer.  ');
    await wrapper.get('form').trigger('submit');

    expect(wrapper.emitted('submit')).toStrictEqual([['Make this clearer.']]);
  });

  it('keeps empty input open and emits cancel on Escape', async () => {
    const wrapper = mount(AnnotationPopup, {
      props: { anchor: { x: 0, y: 0, width: 0, height: 0 } },
    });

    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();

    await wrapper.get('form').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('cancel')).toStrictEqual([[]]);
  });

  it('supports host-provided full-width placement above an anchor', () => {
    const wrapper = mount(AnnotationPopup, {
      props: {
        anchor: { x: 12, y: 400, width: 0, height: 0 },
        placement: 'above',
        width: 480,
      },
    });

    const style = wrapper.get('form').attributes('style');
    expect(style).toContain('left: 12px');
    expect(style).toContain('top: 392px');
    expect(style).toContain('width: 480px');
    expect(style).toContain('transform: translateY(-100%)');
  });

  it('records voice with the SDK controls and inserts the transcript at the saved selection', async () => {
    const wrapper = mount(AnnotationPopup, {
      props: { anchor: { x: 0, y: 0, width: 0, height: 0 } },
    });
    const input = wrapper.get<HTMLInputElement>('.annotation-popup__input');
    await input.setValue('Before after');
    input.element.setSelectionRange(6, 6);
    await input.trigger('select');

    const microphone = wrapper.get('[aria-label="Record voice prompt"]');
    const submit = wrapper.get('.annotation-popup__submit');
    expect(microphone.element.compareDocumentPosition(submit.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await microphone.trigger('click');
    await nextTick();
    expect(wrapper.find('.chat-composer__audio-field').exists()).toBe(true);
    expect(wrapper.get('.annotation-popup__submit').attributes('disabled')).toBeUndefined();

    voiceMock.isRecording!.value = false;
    voiceMock.isTranscribing!.value = true;
    await nextTick();
    expect(wrapper.text()).toContain('Transcribing...');

    voiceMock.isTranscribing!.value = false;
    await nextTick();
    voiceMock.onTranscript?.('spoken');
    await nextTick();

    expect(wrapper.get<HTMLInputElement>('.annotation-popup__input').element.value).toBe('Before spoken after');
  });

  it('transcribes into the draft without sending when the microphone is pressed again', async () => {
    voiceMock.toggle.mockImplementation(async () => {
      if (!voiceMock.isRecording!.value) {
        voiceMock.isRecording!.value = true;
        return;
      }
      voiceMock.isRecording!.value = false;
      voiceMock.isTranscribing!.value = true;
      await Promise.resolve();
      voiceMock.onTranscript?.('spoken note');
      voiceMock.isTranscribing!.value = false;
    });
    const wrapper = mount(AnnotationPopup, {
      props: { anchor: { x: 0, y: 0, width: 0, height: 0 } },
    });

    await wrapper.get('[aria-label="Record voice prompt"]').trigger('click');
    await wrapper.get('[aria-label="Stop recording"]').trigger('click');
    await flushPromises();

    expect(wrapper.get<HTMLInputElement>('.annotation-popup__input').element.value).toBe('spoken note');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('keeps Send enabled while recording and submits only after transcription completes', async () => {
    let finishTranscription!: () => void;
    const transcription = new Promise<void>((resolve) => {
      finishTranscription = resolve;
    });
    voiceMock.stop.mockImplementation(async () => {
      voiceMock.isRecording!.value = false;
      voiceMock.isTranscribing!.value = true;
      await transcription;
      voiceMock.onTranscript?.('send this');
      voiceMock.isTranscribing!.value = false;
      return true;
    });
    const wrapper = mount(AnnotationPopup, {
      props: { anchor: { x: 0, y: 0, width: 0, height: 0 } },
    });

    await wrapper.get('[aria-label="Record voice prompt"]').trigger('click');
    expect(wrapper.get('.annotation-popup__submit').attributes('disabled')).toBeUndefined();

    await wrapper.get('form').trigger('submit');
    await nextTick();
    expect(wrapper.get('.annotation-popup__submit').attributes('disabled')).toBeDefined();
    expect(wrapper.emitted('submit')).toBeUndefined();

    finishTranscription();
    await flushPromises();

    expect(wrapper.emitted('submit')).toStrictEqual([['send this']]);
  });

  it('emits cancel when the user clicks outside the popup', async () => {
    const host = document.createElement('div');
    const outside = document.createElement('button');
    document.body.append(host, outside);
    const wrapper = mount(AnnotationPopup, {
      attachTo: host,
      props: { anchor: { x: 0, y: 0, width: 0, height: 0 } },
    });

    await wrapper.get('input').trigger('pointerdown');
    expect(wrapper.emitted('cancel')).toBeUndefined();

    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(wrapper.emitted('cancel')).toStrictEqual([[]]);

    wrapper.unmount();
    host.remove();
    outside.remove();
  });
});
