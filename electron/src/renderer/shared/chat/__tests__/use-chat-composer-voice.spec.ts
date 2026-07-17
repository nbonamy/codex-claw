import { effectScope } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { BrowserAudioRecorder, RecordedAudio } from '../../audio/browser-audio-recorder';
import { useChatComposerVoice } from '../use-chat-composer-voice';

const recording: RecordedAudio = {
  blob: new Blob(['audio'], { type: 'audio/webm' }),
  durationMs: 100,
};

function fakeRecorder(overrides: Partial<BrowserAudioRecorder> = {}) {
  return {
    release: vi.fn(),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => recording),
    ...overrides,
  } as unknown as BrowserAudioRecorder;
}

describe('useChatComposerVoice', () => {
  it('owns the recording and transcription lifecycle', async () => {
    const onTranscript = vi.fn();
    const recorder = fakeRecorder();
    const voice = useChatComposerVoice({
      isDisabled: () => false,
      isSending: () => false,
      onTranscript,
    }, {
      canTranscribe: () => true,
      createRecorder: () => recorder,
      isRecordingSupported: () => true,
      transcribe: vi.fn(async () => ({ text: 'dictated change' })),
    });

    await voice.toggle();
    expect(voice.isRecording.value).toBe(true);
    expect(voice.buttonLabel.value).toBe('Stop recording');

    await voice.toggle();
    expect(voice.isRecording.value).toBe(false);
    expect(voice.isTranscribing.value).toBe(false);
    expect(onTranscript).toHaveBeenCalledWith('dictated change');
  });

  it('releases a partially started recorder and exposes the failure', async () => {
    const recorder = fakeRecorder({ start: vi.fn(async () => { throw new Error('Microphone denied'); }) });
    const voice = useChatComposerVoice({
      isDisabled: () => false,
      isSending: () => false,
      onTranscript: vi.fn(),
    }, {
      canTranscribe: () => true,
      createRecorder: () => recorder,
      isRecordingSupported: () => true,
    });

    await voice.toggle();

    expect(recorder.release).toHaveBeenCalledOnce();
    expect(voice.error.value).toBe('Microphone denied');
    expect(voice.buttonTitle.value).toBe('Microphone denied');
  });

  it('disables unavailable voice input and releases active recording with its scope', async () => {
    const unavailable = useChatComposerVoice({
      isDisabled: () => false,
      isSending: () => false,
      onTranscript: vi.fn(),
    }, {
      canTranscribe: () => false,
      isRecordingSupported: () => true,
    });
    expect(unavailable.buttonDisabled.value).toBe(true);
    expect(unavailable.buttonTitle.value).toBe('Apple speech transcription is not available.');

    const recorder = fakeRecorder();
    const scope = effectScope();
    const scoped = scope.run(() => useChatComposerVoice({
      isDisabled: () => false,
      isSending: () => false,
      onTranscript: vi.fn(),
    }, {
      canTranscribe: () => true,
      createRecorder: () => recorder,
      isRecordingSupported: () => true,
    }))!;
    await scoped.toggle();
    scope.stop();
    expect(recorder.release).toHaveBeenCalledOnce();
  });
});
