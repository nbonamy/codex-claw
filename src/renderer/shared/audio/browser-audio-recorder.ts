export type RecordedAudio = {
  blob: Blob;
  durationMs: number;
};

type AudioContextConstructor = typeof AudioContext;

export function isBrowserAudioRecordingSupported(): boolean {
  return Boolean(
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined' &&
    resolveAudioContextConstructor() &&
    (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ||
      MediaRecorder.isTypeSupported('audio/webm') ||
      MediaRecorder.isTypeSupported('audio/mp4')),
  );
}

export class BrowserAudioRecorder {
  private chunks: Blob[] = [];
  private mediaRecorder: MediaRecorder | null = null;
  private startTime = 0;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;
  private bufferLength = 0;
  private microphone: MediaStreamAudioSourceNode | null = null;

  async start(): Promise<void> {
    this.release();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.startTime = Date.now();
    const AudioContextCtor = resolveAudioContextConstructor();
    if (!AudioContextCtor) {
      throw new Error('Audio recording is not supported in this browser.');
    }

    this.audioContext = new AudioContextCtor();
    await this.audioContext.resume();
    this.microphone = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.bufferLength = this.analyser.frequencyBinCount;
    this.microphone.connect(this.analyser);
    this.mediaRecorder = new MediaRecorder(this.stream, preferredMediaRecorderOptions());
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.mediaRecorder.start();
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getBufferLength(): number {
    return this.bufferLength;
  }

  stop(): Promise<RecordedAudio> {
    const recorder = this.mediaRecorder;
    if (!recorder || recorder.state === 'inactive') {
      return Promise.reject(new Error('No active audio recording.'));
    }

    return new Promise((resolve, reject) => {
      recorder.onerror = () => {
        this.release();
        reject(new Error('Audio recording failed.'));
      };
      recorder.onstop = () => {
        const durationMs = Date.now() - this.startTime;
        const blob = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' });
        this.release();
        resolve({ blob, durationMs });
      };
      recorder.stop();
    });
  }

  release(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.stream?.getTracks().forEach((track) => {
      track.stop();
    });
    this.microphone?.disconnect();
    this.analyser?.disconnect();
    void this.audioContext?.close();
    this.stream = null;
    this.mediaRecorder = null;
    this.microphone = null;
    this.analyser = null;
    this.audioContext = null;
    this.bufferLength = 0;
    this.chunks = [];
    this.startTime = 0;
  }
}

function preferredMediaRecorderOptions(): MediaRecorderOptions {
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
    return { mimeType: 'audio/webm;codecs=opus' };
  }

  if (MediaRecorder.isTypeSupported('audio/webm')) {
    return { mimeType: 'audio/webm' };
  }

  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return { mimeType: 'audio/mp4' };
  }

  return {};
}

function resolveAudioContextConstructor(): AudioContextConstructor | null {
  return window.AudioContext ?? ((window as unknown as {
    webkitAudioContext?: AudioContextConstructor;
  }).webkitAudioContext ?? null);
}
