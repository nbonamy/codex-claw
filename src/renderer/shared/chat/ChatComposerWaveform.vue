<template>
  <div
    class="chat-composer-waveform"
    :aria-label="label"
    role="img"
  >
    <canvas
      ref="waveform"
      :width="width"
      :height="height"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

type WaveformAudioRecorder = {
  getAnalyser(): AnalyserNode | null;
  getBufferLength(): number;
};

const props = withDefaults(defineProps<{
  active?: boolean;
  audioRecorder: WaveformAudioRecorder | null;
  height?: number;
  label?: string;
  width?: number;
}>(), {
  active: false,
  height: 28,
  label: 'Audio waveform',
  width: 640,
});

const waveform = ref<HTMLCanvasElement | null>(null);
let animationFrameId: number | null = null;
let dataArray: Uint8Array<ArrayBuffer> | null = null;
let amplitudeHistory: number[] = [];
let lastSampleTime = 0;

const barGap = 2;
const barWidth = 2;
const minBarHeight = 2;
const sampleIntervalMs = 60;
const voiceScale = 3.2;

watch(() => props.active, (active) => {
  if (active) {
    startAnimation();
    return;
  }

  stopAnimation();
});

onMounted(() => {
  if (props.active) {
    startAnimation();
  }
});

onBeforeUnmount(stopAnimation);

function startAnimation(): void {
  if (animationFrameId === null) {
    draw();
  }
}

function stopAnimation(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  dataArray = null;
  amplitudeHistory = [];
  lastSampleTime = 0;
}

function draw(): void {
  try {
    const canvas = waveform.value;
    const analyser = props.audioRecorder?.getAnalyser();
    const bufferLength = props.audioRecorder?.getBufferLength() ?? 0;
    const canvasContext = canvas?.getContext('2d');
    if (!canvas || !canvasContext || !analyser || bufferLength <= 0) {
      animationFrameId = props.active ? requestAnimationFrame(draw) : null;
      return;
    }

    const now = Date.now();
    if (now - lastSampleTime >= sampleIntervalMs) {
      if (!dataArray || dataArray.length !== bufferLength) {
        dataArray = new Uint8Array(new ArrayBuffer(bufferLength));
        amplitudeHistory = [];
      }
      analyser.getByteTimeDomainData(dataArray);
      amplitudeHistory.push(calculateVoiceActivity(dataArray));
      amplitudeHistory = amplitudeHistory.slice(-getMaxBars(canvas.width));
      lastSampleTime = now;
    }

    canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    canvasContext.fillStyle = getComputedStyle(canvas).color;

    const step = barWidth + barGap;
    const centerY = canvas.height / 2;
    for (let index = amplitudeHistory.length - 1; index >= 0; index -= 1) {
      const positionFromRight = amplitudeHistory.length - 1 - index;
      const x = canvas.width - barWidth - positionFromRight * step;
      if (x < 0) {
        break;
      }

      const barHeight = Math.max(minBarHeight, amplitudeHistory[index] * canvas.height);
      canvasContext.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
    }
  } catch (error) {
    console.error('Error drawing waveform', error);
  }

  animationFrameId = props.active ? requestAnimationFrame(draw) : null;
}

function calculateVoiceActivity(samples: Uint8Array<ArrayBuffer>): number {
  let sumSquares = 0;
  for (const sample of samples) {
    const centeredSample = (sample - 128) / 128;
    sumSquares += centeredSample * centeredSample;
  }

  return Math.min(1, Math.sqrt(sumSquares / samples.length) * voiceScale);
}

function getMaxBars(width: number): number {
  return Math.max(1, Math.ceil(width / (barWidth + barGap)));
}
</script>

<style scoped>
.chat-composer-waveform {
  flex: 1 1 auto;
  min-width: 0;
  height: var(--space-10);
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
}

.chat-composer-waveform canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
