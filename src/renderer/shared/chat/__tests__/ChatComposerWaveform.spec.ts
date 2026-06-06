import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatComposerWaveform from '../ChatComposerWaveform.vue';

type WaveformAudioRecorder = {
  getAnalyser(): AnalyserNode | null;
  getBufferLength(): number;
};

function createAudioRecorder(options: {
  bufferLength: number;
  getByteTimeDomainData: (target: Uint8Array) => void;
}): WaveformAudioRecorder {
  return {
    getAnalyser: () => ({
      getByteTimeDomainData: options.getByteTimeDomainData,
    }) as unknown as AnalyserNode,
    getBufferLength: () => options.bufferLength,
  };
}

describe('ChatComposerWaveform', () => {
  let canvasContext: {
    clearRect: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
    fillStyle: string;
  };
  let cancelAnimationFrameSpy: ReturnType<typeof vi.spyOn>;
  let rafCallbacks: FrameRequestCallback[];
  let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    canvasContext = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
    };
    rafCallbacks = [];
    cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => canvasContext as unknown as CanvasRenderingContext2D);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      color: 'rgb(10, 20, 30)',
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws voice activity from the right while active and stops when deactivated', async () => {
    const getByteTimeDomainData = vi.fn((target: Uint8Array) => {
      target.set([128, 160, 96, 128]);
    });
    const audioRecorder = createAudioRecorder({
      bufferLength: 4,
      getByteTimeDomainData,
    });

    const wrapper = mount(ChatComposerWaveform, {
      props: {
        active: true,
        audioRecorder,
        height: 20,
        label: 'Recording',
        width: 40,
      },
    });

    expect(wrapper.attributes('role')).toBe('img');
    expect(wrapper.attributes('aria-label')).toBe('Recording');
    expect(getByteTimeDomainData).toHaveBeenCalledTimes(1);
    expect(canvasContext.clearRect).toHaveBeenCalledWith(0, 0, 40, 20);
    expect(canvasContext.fillStyle).toBe('rgb(10, 20, 30)');
    expect(canvasContext.fillRect).toHaveBeenCalledWith(38, expect.any(Number), 2, expect.any(Number));
    expect(requestAnimationFrameSpy).toHaveBeenCalled();

    await wrapper.setProps({ active: false } as never);

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(1);
  });

  it('starts when active changes and reschedules while inputs are unavailable', async () => {
    const wrapper = mount(ChatComposerWaveform, {
      props: {
        active: false,
        audioRecorder: null,
      },
    });

    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    await wrapper.setProps({ active: true } as never);

    expect(requestAnimationFrameSpy).toHaveBeenCalledWith(expect.any(Function));
  });

  it('resets the scrolling history when analyser buffer length changes', () => {
    let now = 1_000;
    let bufferLength = 4;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const getByteTimeDomainData = vi.fn((target: Uint8Array) => {
      target.fill(160);
    });
    const audioRecorder = {
      getAnalyser: () => ({
        getByteTimeDomainData,
      }) as unknown as AnalyserNode,
      getBufferLength: () => bufferLength,
    };

    mount(ChatComposerWaveform, {
      props: {
        active: true,
        audioRecorder,
        width: 40,
      },
    });
    bufferLength = 2;
    now = 1_060;
    rafCallbacks.at(-1)?.(now);

    expect(getByteTimeDomainData).toHaveBeenCalledTimes(2);
    expect(canvasContext.fillRect.mock.calls.map((call) => call[0])).toEqual([38, 38]);
  });

  it('scrolls older voice activity left as new samples arrive', () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const samples = [
      [128, 128, 128, 128],
      [180, 180, 180, 180],
    ];
    const getByteTimeDomainData = vi.fn((target: Uint8Array) => {
      target.set(samples[Math.min(getByteTimeDomainData.mock.calls.length - 1, samples.length - 1)]);
    });
    const audioRecorder = createAudioRecorder({
      bufferLength: 4,
      getByteTimeDomainData,
    });

    mount(ChatComposerWaveform, {
      props: {
        active: true,
        audioRecorder,
        height: 20,
        width: 40,
      },
    });
    now = 1_060;
    rafCallbacks.at(-1)?.(now);

    expect(getByteTimeDomainData).toHaveBeenCalledTimes(2);
    const calls = canvasContext.fillRect.mock.calls;
    expect(calls.map((call) => call[0])).toEqual([38, 38, 34]);
    expect(calls[1][3]).toBeGreaterThan(2);
    expect(calls[2][3]).toBe(2);
  });

  it('stops harmlessly when no animation is running', () => {
    const wrapper = mount(ChatComposerWaveform, {
      props: {
        active: false,
        audioRecorder: null,
      },
    });

    wrapper.unmount();

    expect(cancelAnimationFrameSpy).not.toHaveBeenCalled();
  });
});
