import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserAudioRecorder, isBrowserAudioRecordingSupported } from '../browser-audio-recorder';

describe('BrowserAudioRecorder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports unsupported recording when browser APIs are missing', () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });
    vi.stubGlobal('MediaRecorder', undefined);

    expect(isBrowserAudioRecordingSupported()).toBe(false);
  });

  it('records audio with the preferred WebM codec and stops tracks', async () => {
    const track = { stop: vi.fn() };
    const audioContext = installAudioContextMock();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [track],
        })),
      },
    });
    const FakeMediaRecorder = mediaRecorderClass((mimeType) => mimeType === 'audio/webm;codecs=opus');
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const recorder = new BrowserAudioRecorder();

    await recorder.start();
    expect(recorder.getAnalyser()).toBe(audioContext.analyser);
    expect(recorder.getBufferLength()).toBe(4);
    const recording = await recorder.stop();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeMediaRecorder.createdOptions).toStrictEqual({ mimeType: 'audio/webm;codecs=opus' });
    expect(recording.blob.type).toBe('audio/webm;codecs=opus');
    expect(recording.durationMs).toBeGreaterThanOrEqual(0);
    expect(track.stop).toHaveBeenCalled();
  });

  it('falls back through supported mime types', async () => {
    installAudioContextMock();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [],
        })),
      },
    });
    const FakeMediaRecorder = mediaRecorderClass((mimeType) => mimeType === 'audio/mp4');
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const recorder = new BrowserAudioRecorder();

    await recorder.start();
    await recorder.stop();

    expect(FakeMediaRecorder.createdOptions).toStrictEqual({ mimeType: 'audio/mp4' });
  });

  it('uses plain WebM when the opus codec is unavailable', async () => {
    installAudioContextMock();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [],
        })),
      },
    });
    const FakeMediaRecorder = mediaRecorderClass((mimeType) => mimeType === 'audio/webm');
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const recorder = new BrowserAudioRecorder();

    await recorder.start();
    await recorder.stop();

    expect(FakeMediaRecorder.createdOptions).toStrictEqual({ mimeType: 'audio/webm' });
  });

  it('uses browser defaults when no preferred mime type is supported', async () => {
    installAudioContextMock();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [],
        })),
      },
    });
    const FakeMediaRecorder = mediaRecorderClass(() => false);
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const recorder = new BrowserAudioRecorder();

    await recorder.start();
    await recorder.stop();

    expect(FakeMediaRecorder.createdOptions).toStrictEqual({});
  });

  it('releases active recordings without returning audio', async () => {
    const track = { stop: vi.fn() };
    const audioContext = installAudioContextMock();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [track],
        })),
      },
    });
    const FakeMediaRecorder = mediaRecorderClass(() => true);
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const recorder = new BrowserAudioRecorder();

    await recorder.start();
    recorder.release();

    expect(audioContext.source.disconnect).toHaveBeenCalled();
    expect(audioContext.analyser.disconnect).toHaveBeenCalled();
    expect(audioContext.close).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalled();
  });

  it('rejects and releases when the MediaRecorder errors', async () => {
    const track = { stop: vi.fn() };
    installAudioContextMock();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [track],
        })),
      },
    });
    const FakeMediaRecorder = mediaRecorderClass(() => true, { failOnStop: true });
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const recorder = new BrowserAudioRecorder();

    await recorder.start();

    await expect(recorder.stop()).rejects.toThrow('Audio recording failed.');
    expect(track.stop).toHaveBeenCalled();
  });

  it('rejects when stopping without an active recording', async () => {
    const recorder = new BrowserAudioRecorder();

    await expect(recorder.stop()).rejects.toThrow('No active audio recording.');
  });
});

function mediaRecorderClass(isTypeSupported: (mimeType: string) => boolean, options: { failOnStop?: boolean } = {}) {
  return class FakeMediaRecorder {
    static createdOptions: MediaRecorderOptions | undefined;
    static isTypeSupported = vi.fn(isTypeSupported);

    mimeType: string;
    ondataavailable: ((event: BlobEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onstop: (() => void) | null = null;
    state: RecordingState = 'inactive';

    constructor(_stream: MediaStream, options: MediaRecorderOptions = {}) {
      FakeMediaRecorder.createdOptions = options;
      this.mimeType = options.mimeType ?? 'audio/webm';
    }

    start(): void {
      this.state = 'recording';
    }

    stop(): void {
      if (options.failOnStop) {
        this.state = 'inactive';
        this.onerror?.();
        return;
      }

      this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) } as BlobEvent);
      this.state = 'inactive';
      this.onstop?.();
    }
  };
}

function installAudioContextMock() {
  const analyser = {
    disconnect: vi.fn(),
    fftSize: 0,
    frequencyBinCount: 4,
    getByteTimeDomainData: vi.fn(),
  };
  const source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const audioContext = {
    analyser,
    close: vi.fn(async () => undefined),
    createAnalyser: vi.fn(() => analyser),
    createMediaStreamSource: vi.fn(() => source),
    resume: vi.fn(async () => undefined),
    source,
  };

  class FakeAudioContext {
    close = audioContext.close;
    createAnalyser = audioContext.createAnalyser;
    createMediaStreamSource = audioContext.createMediaStreamSource;
    resume = audioContext.resume;
  }

  vi.stubGlobal('AudioContext', FakeAudioContext);
  return audioContext;
}
