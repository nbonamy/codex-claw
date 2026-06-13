import { afterEach, describe, expect, it, vi } from 'vitest';
import fixWebmDuration from 'fix-webm-duration';
import * as webmConverter from 'webm-to-wav-converter';
import { prepareAppleSpeechAudio, transcribeRecordedAudio } from '../apple-speech-transcription';

vi.mock('fix-webm-duration', () => ({
  default: vi.fn(async (blob: Blob) => blob),
}));

vi.mock('webm-to-wav-converter', () => ({
  getWaveBlob: vi.fn(async () => new Blob(['wav'], { type: 'audio/wav' })),
}));

describe('apple speech transcription', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('converts WebM recordings to WAV before sending them to main', async () => {
    const api = {
      transcribeAppleSpeech: vi.fn(async () => ({ text: 'hello' })),
    };
    const recording = {
      blob: new Blob(['webm'], { type: 'audio/webm' }),
      durationMs: 1200,
    };

    const result = await transcribeRecordedAudio(recording, api);

    expect(result).toStrictEqual({ text: 'hello' });
    expect(fixWebmDuration).toHaveBeenCalledWith(recording.blob, 1200);
    expect(webmConverter.getWaveBlob).toHaveBeenCalledWith(recording.blob, false);
    expect(api.transcribeAppleSpeech).toHaveBeenCalledWith(expect.any(ArrayBuffer), {
      locale: navigator.language,
    });
  });

  it('keeps non-WebM recordings as-is', async () => {
    const audio = await prepareAppleSpeechAudio({
      blob: new Blob(['wav'], { type: 'audio/wav' }),
      durationMs: 800,
    });

    expect(audio.byteLength).toBeGreaterThan(0);
    expect(webmConverter.getWaveBlob).not.toHaveBeenCalled();
  });

  it('preserves the original WebM mime type when duration fixing changes it', async () => {
    vi.mocked(fixWebmDuration).mockResolvedValueOnce(new Blob(['fixed'], { type: 'video/webm' }));

    await prepareAppleSpeechAudio({
      blob: new Blob(['webm'], { type: 'audio/webm' }),
      durationMs: 800,
    });

    const convertedBlob = vi.mocked(webmConverter.getWaveBlob).mock.calls.at(-1)?.[0];
    expect(convertedBlob?.type).toBe('audio/webm');
  });

  it('throws when the preload bridge does not expose transcription', async () => {
    await expect(transcribeRecordedAudio({
      blob: new Blob(['wav'], { type: 'audio/wav' }),
      durationMs: 800,
    }, undefined)).rejects.toThrow('Apple speech transcription is not available.');
  });
});
