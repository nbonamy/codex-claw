import fixWebmDuration from 'fix-webm-duration';
import * as webmConverter from 'webm-to-wav-converter';
import type { AppleSpeechTranscriptionResult } from '../../../shared/contracts';
import type { RecordedAudio } from './browser-audio-recorder';

type AppleSpeechTranscriptionApi = {
  transcribeAppleSpeech(audioData: ArrayBuffer, options?: { locale?: string }): Promise<AppleSpeechTranscriptionResult>;
};

export async function transcribeRecordedAudio(
  recording: RecordedAudio,
  api: AppleSpeechTranscriptionApi | undefined = window.codexClaw,
): Promise<AppleSpeechTranscriptionResult> {
  if (!api?.transcribeAppleSpeech) {
    throw new Error('Apple speech transcription is not available.');
  }

  const audioData = await prepareAppleSpeechAudio(recording);
  return api.transcribeAppleSpeech(audioData, {
    locale: navigator.language,
  });
}

export async function prepareAppleSpeechAudio(recording: RecordedAudio): Promise<ArrayBuffer> {
  const source = await normalizeWebmDuration(recording);
  const wavBlob = source.type.includes('webm')
    ? await webmConverter.getWaveBlob(source, false)
    : source;

  return wavBlob.arrayBuffer();
}

async function normalizeWebmDuration(recording: RecordedAudio): Promise<Blob> {
  if (!recording.blob.type.includes('webm')) {
    return recording.blob;
  }

  const fixedBlob = await fixWebmDuration(recording.blob, recording.durationMs);
  if (fixedBlob.type === recording.blob.type) {
    return fixedBlob;
  }

  return new Blob([fixedBlob], { type: recording.blob.type });
}
