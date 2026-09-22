<template>
  <div class="design-diagram-view" :class="{ 'design-diagram-view--compact': compact }">
    <div
      class="design-diagram-view__viewport"
      :class="{ 'design-diagram-view__viewport--pannable': !compact && scale > 1, 'design-diagram-view__viewport--panning': panning }"
      :tabindex="compact ? undefined : 0"
      :aria-label="compact ? undefined : translate('design.canvasInteraction')"
      @wheel="handleWheel"
      @pointerdown="startPan"
      @pointermove="movePan"
      @pointerup="stopPan"
      @pointercancel="stopPan"
      @keydown="handleKeydown"
    >
      <div v-if="error" class="design-diagram-view__error" role="alert">{{ error }}</div>
      <div v-else-if="diagram.content.kind === 'image' && !imageSource" class="design-diagram-view__loading">{{ translate('common.loading') }}</div>
      <img
        v-else
        class="design-diagram-view__image"
        :src="source"
        :alt="diagram.content.kind === 'image' ? diagram.content.alt : diagram.title"
        :style="imageTransform"
        draggable="false"
      />
    </div>
    <div v-if="!compact" class="design-diagram-view__controls">
      <button type="button" :aria-label="translate('design.zoomOut')" :disabled="scale <= minScale" @click="zoomBy(-zoomStep)">−</button>
      <button type="button" :aria-label="translate('design.resetView')" @click="resetView">{{ Math.round(scale * 100) }}%</button>
      <button type="button" :aria-label="translate('design.zoomIn')" :disabled="scale >= maxScale" @click="zoomBy(zoomStep)">+</button>
      <span class="sr-only" aria-live="polite">{{ translate('design.zoomLevel', { percent: Math.round(scale * 100) }) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { renderMermaidSVG } from 'beautiful-mermaid';
import type { DesignDiagram } from '@codex-claw/core/design';
import { translate } from '../i18n';

const props = withDefaults(defineProps<{
  compact?: boolean;
  diagram: DesignDiagram;
  imageSource?: string;
}>(), {
  compact: false,
  imageSource: '',
});

const rendering = computed(() => {
  try {
    if (props.diagram.content.kind === 'image') return { source: props.imageSource, error: '' };
    const raw = props.diagram.content.kind === 'mermaid'
      ? renderMermaidSVG(props.diagram.content.source, { transparent: true })
      : props.diagram.content.source;
    const svg = sanitizeSvg(raw);
    return { source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, error: '' };
  } catch (error) {
    return { source: '', error: error instanceof Error ? error.message : String(error) };
  }
});

const source = computed(() => rendering.value.source);
const error = computed(() => rendering.value.error);
const minScale = 0.5;
const maxScale = 4;
const zoomStep = 0.25;
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const panning = ref(false);
let panOrigin: { pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null = null;
const imageTransform = computed(() => ({
  transform: `translate(${offsetX.value}px, ${offsetY.value}px) scale(${scale.value})`,
}));

watch(() => `${props.diagram.id}:${props.diagram.revision}`, resetView);

function zoomBy(delta: number): void {
  if (props.compact) return;
  scale.value = Math.min(maxScale, Math.max(minScale, Number((scale.value + delta).toFixed(2))));
  if (scale.value <= 1) {
    offsetX.value = 0;
    offsetY.value = 0;
  }
}

function handleWheel(event: WheelEvent): void {
  if (props.compact) return;
  event.preventDefault();
  zoomBy(event.deltaY < 0 ? zoomStep : -zoomStep);
}

function startPan(event: PointerEvent): void {
  if (props.compact || scale.value <= 1 || event.button !== 0) return;
  panning.value = true;
  panOrigin = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
  };
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function movePan(event: PointerEvent): void {
  if (!panning.value || !panOrigin) return;
  offsetX.value = panOrigin.offsetX + event.clientX - panOrigin.pointerX;
  offsetY.value = panOrigin.offsetY + event.clientY - panOrigin.pointerY;
}

function stopPan(): void {
  panning.value = false;
  panOrigin = null;
}

function handleKeydown(event: KeyboardEvent): void {
  if (props.compact || scale.value <= 1) return;
  const movement = event.shiftKey ? 50 : 20;
  const offsets: Partial<Record<KeyboardEvent['key'], [number, number]>> = {
    ArrowLeft: [movement, 0],
    ArrowRight: [-movement, 0],
    ArrowUp: [0, movement],
    ArrowDown: [0, -movement],
  };
  const offset = offsets[event.key];
  if (!offset) return;
  event.preventDefault();
  offsetX.value += offset[0];
  offsetY.value += offset[1];
}

function resetView(): void {
  scale.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
  stopPan();
}

function sanitizeSvg(source: string): string {
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (document.querySelector('parsererror') || document.documentElement.tagName.toLowerCase() !== 'svg') {
    throw new Error('The diagram did not produce valid SVG.');
  }
  document.querySelectorAll('script, foreignObject, iframe, object, embed').forEach(element => element.remove());
  document.querySelectorAll('style').forEach(element => {
    element.textContent = (element.textContent ?? '')
      .replace(/url\([^)]*\)/giu, 'none')
      .replace(/@import\s+[^;]+;?/giu, '');
  });
  for (const element of document.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith('on')
        || value.includes('javascript:')
        || value.includes('url(')
        || ((name === 'href' || name === 'xlink:href') && !value.startsWith('#'))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return new XMLSerializer().serializeToString(document.documentElement);
}
</script>

<style scoped>
.design-diagram-view {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.design-diagram-view__viewport {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  overflow: hidden;
  outline: none;
  touch-action: none;
}

.design-diagram-view__viewport:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.design-diagram-view__viewport--pannable {
  cursor: grab;
}

.design-diagram-view__viewport--panning {
  cursor: grabbing;
}

.design-diagram-view__image {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center;
  transition: transform 120ms ease-out;
  user-select: none;
}

.design-diagram-view__viewport--panning .design-diagram-view__image {
  transition: none;
}

.design-diagram-view--compact {
  overflow: hidden;
}

.design-diagram-view--compact .design-diagram-view__image {
  width: 100%;
  height: 100%;
}

.design-diagram-view__controls {
  position: absolute;
  right: var(--space-8);
  bottom: var(--space-8);
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-lg);
  background: var(--color-overlay);
  box-shadow: var(--shadow-sm);
}

.design-diagram-view__controls button {
  min-width: 30px;
  height: 28px;
  padding: 0 var(--space-6);
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.design-diagram-view__controls button:hover:not(:disabled) {
  background: var(--color-surface-high);
}

.design-diagram-view__controls button:disabled {
  opacity: 0.45;
  cursor: default;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.design-diagram-view__loading,
.design-diagram-view__error {
  padding: var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  text-align: center;
}

.design-diagram-view__error {
  color: var(--color-error);
}
</style>
