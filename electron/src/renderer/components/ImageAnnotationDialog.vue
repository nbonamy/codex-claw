<template>
  <el-dialog
    class="claw-dialog image-annotation-dialog"
    :model-value="visible"
    :show-close="false"
    :teleported="false"
    :close-on-click-modal="!submitting && !sending"
    :close-on-press-escape="!activeComment && !submitting && !sending"
    destroy-on-close
    style="height: 80vh; margin-top: 10vh"
    width="80vw"
    @opened="focusDialog"
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-dialog__header image-annotation-dialog__header">
        <div class="image-annotation-dialog__header-main">
          <h2 class="claw-dialog__title">{{ title }}</h2>
          <div class="image-annotation-dialog__toolbar" role="toolbar" aria-label="Image annotation tools">
            <el-tooltip
              v-for="item in tools"
              :key="item.id"
              :content="toolTooltip(item)"
              placement="bottom"
              :show-after="300"
            >
              <button
                class="image-annotation-dialog__tool"
                :class="{ 'image-annotation-dialog__tool--active': activeTool === item.id }"
                type="button"
                :aria-label="item.label"
                :aria-pressed="activeTool === item.id"
                @click="selectTool(item.id)"
              >
                <component :is="item.icon" aria-hidden="true" />
              </button>
            </el-tooltip>
            <span class="image-annotation-dialog__toolbar-separator" aria-hidden="true" />
            <div class="image-annotation-dialog__toolbar-group" role="group" aria-label="Image scale">
              <el-tooltip content="Retina mode — report pixels at half size" placement="bottom" :show-after="300">
                <button
                  class="image-annotation-dialog__tool image-annotation-dialog__tool--retina"
                  :class="{ 'image-annotation-dialog__tool--active': retinaMode }"
                  type="button"
                  aria-label="Retina mode"
                  :aria-pressed="retinaMode"
                  @click="toggleRetinaMode"
                >
                  @2x
                </button>
              </el-tooltip>
            </div>
            <span class="image-annotation-dialog__toolbar-separator" aria-hidden="true" />
            <div class="image-annotation-dialog__toolbar-group" role="group" aria-label="Annotation history">
              <button
                class="image-annotation-dialog__tool"
                type="button"
                aria-label="Undo last annotation"
                title="Undo last annotation (Delete)"
                :disabled="annotations.length === 0"
                @click="undoLastAnnotation"
              >
                <ArrowBackUpIcon aria-hidden="true" />
              </button>
              <button
                class="image-annotation-dialog__tool"
                type="button"
                aria-label="Clear annotations"
                title="Clear annotations"
                :disabled="annotations.length === 0"
                @click="clearAnnotations"
              >
                <Trash2Icon aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <div class="image-annotation-dialog__header-trailing">
          <div class="image-annotation-dialog__inspector" aria-label="Image information">
            <div class="image-annotation-dialog__inspector-item image-annotation-dialog__inspector-color">
              <span
                class="image-annotation-dialog__color-swatch"
                :class="{ 'image-annotation-dialog__color-swatch--sampled': cursorPixel }"
                :style="cursorSwatchStyle"
                aria-hidden="true"
              />
              <span>
                <strong>{{ cursorColorText }}</strong>
                <small>Tab to copy</small>
              </span>
            </div>
            <div class="image-annotation-dialog__inspector-item">
              <strong>{{ reportedImageSize.width }}×{{ reportedImageSize.height }}px</strong>
              <small>Image size</small>
            </div>
            <div class="image-annotation-dialog__inspector-item">
              <strong>{{ Math.round(zoom * 100) }}%</strong>
              <small>Zoom</small>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div
      ref="dialogBody"
      class="image-annotation-dialog__body"
      tabindex="-1"
      @keydown="handleKeyDown"
    >
      <div class="image-annotation-dialog__content">
        <div
          ref="workspace"
          class="image-annotation-dialog__workspace"
          @wheel="handleWorkspaceWheel"
        >
          <div
            ref="stage"
            class="image-annotation-dialog__stage"
            :class="`image-annotation-dialog__stage--${activeTool}`"
            :style="stageStyle"
          >
            <img
              ref="image"
              class="image-annotation-dialog__image"
              :src="resolvedImageSrc"
              :alt="imageAlt"
              :style="imageStyle"
              draggable="false"
              @error="imageFailed"
              @load="imageLoaded"
            >
            <canvas
              ref="canvas"
              class="image-annotation-dialog__canvas"
              :width="canvasSize.width"
              :height="canvasSize.height"
              aria-label="Image annotation canvas"
              tabindex="0"
              @pointerdown="startDrawing"
              @pointerleave="leaveCanvas"
              @pointermove="continueDrawing"
              @pointerup="finishDrawing"
            />

            <AnnotationPopup
              v-if="activeComment"
              :anchor="activeComment.anchor"
              :description="activeComment.description"
              :initial-value="activeComment.initialValue"
              label="Image annotation comment"
              :placement="activeComment.placement"
              placeholder="What should change?"
              strategy="fixed"
              submit-label="Save annotation comment"
              :width="320"
              @cancel="cancelComment"
              @submit="saveComment"
            />
          </div>
        </div>

        <aside class="image-annotation-dialog__comments" aria-label="Image annotations">
          <ol v-if="annotations.length > 0" class="image-annotation-dialog__comment-list">
            <li v-for="annotation in annotations" :key="annotation.id">
              <button
                class="image-annotation-dialog__comment"
                type="button"
                :aria-label="`Edit annotation ${annotation.number}`"
                @click="editComment(annotation)"
              >
                <span class="image-annotation-dialog__comment-number">{{ annotation.number }}</span>
                <span>
                  <strong>{{ toolLabel(annotation.tool) }}</strong>
                  <small>{{ annotation.comment || 'Add a comment' }}</small>
                </span>
              </button>
              <button
                class="image-annotation-dialog__comment-remove"
                type="button"
                :aria-label="`Remove annotation ${annotation.number}`"
                @click="removeAnnotation(annotation.id)"
              >
                <X aria-hidden="true" />
              </button>
            </li>
          </ol>
          <div v-else class="image-annotation-dialog__comments-empty">No annotations yet</div>
        </aside>
      </div>

    </div>

    <template #footer>
      <div class="claw-dialog__footer image-annotation-dialog__footer">
        <el-button :disabled="submitting || sending" @click="emit('close')">Cancel</el-button>
        <AnnotationSendButton
          :count="annotations.length"
          :disabled="annotations.length === 0 || submitting || sending"
          :label="`Send annotated image with ${annotations.length} annotations`"
          @click="sendAnnotatedImage"
        />
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import {
  ArrowBackUpIcon,
  ArrowUpRightIcon,
  ArrowsHorizontalIcon,
  ArrowsVerticalIcon,
  Circle,
  RectangleIcon,
  Trash2Icon,
  X,
} from '../shared/icons/app-icons';
import AnnotationPopup, { type AnnotationPopupAnchor } from './AnnotationPopup.vue';
import AnnotationSendButton from './AnnotationSendButton.vue';
import {
  annotationAnchor,
  annotationPixelLength,
  defaultImageAnnotationPalette,
  drawImageAnnotations,
  isDrawableAnnotation,
  measurementAnnotation,
  type ImageAnnotation,
  type ImageAnnotationPalette,
  type ImageAnnotationPoint,
  type ImageAnnotationTool,
} from './image-annotation';

export type ImageAnnotationSendPayload = {
  annotations: ImageAnnotation[];
  dataUrl: string;
  fileName: string;
  height: number;
  pixelRatio: 1 | 2;
  width: number;
};

const props = withDefaults(defineProps<{
  fallbackImageSrc?: string;
  fileName?: string;
  imageAlt?: string;
  imageSrc: string;
  initialPixelRatio?: 1 | 2;
  submitting?: boolean;
  title?: string;
  visible: boolean;
}>(), {
  fileName: 'annotated-image.png',
  imageAlt: 'Image to annotate',
  initialPixelRatio: 1,
  submitting: false,
  title: 'Annotate',
});

const emit = defineEmits<{
  close: [];
  'image-error': [];
  send: [payload: ImageAnnotationSendPayload];
}>();

type ToolItem = {
  icon: Component;
  id: ImageAnnotationTool;
  label: string;
  shortcut: string;
};

const tools: ToolItem[] = [
  { id: 'arrow', label: 'Arrow', shortcut: 'a', icon: ArrowUpRightIcon },
  { id: 'oval', label: 'Oval', shortcut: 'o', icon: Circle },
  { id: 'rectangle', label: 'Rectangle', shortcut: 'r', icon: RectangleIcon },
  { id: 'measure-horizontal', label: 'Measure horizontal gap', shortcut: 'h', icon: ArrowsHorizontalIcon },
  { id: 'measure-vertical', label: 'Measure vertical gap', shortcut: 'v', icon: ArrowsVerticalIcon },
];

const dialogBody = ref<HTMLElement | null>(null);
const workspace = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const image = ref<HTMLImageElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const activeTool = ref<ImageAnnotationTool>('arrow');
const annotations = ref<ImageAnnotation[]>([]);
const draft = ref<ImageAnnotation | null>(null);
const imageData = ref<ImageData | null>(null);
const imageSize = ref({ width: 1, height: 1 });
const resolvedImageSrc = ref(props.imageSrc);
const zoom = ref(1);
const retinaMode = ref(props.initialPixelRatio === 2);
const hoverPoint = ref<ImageAnnotationPoint | null>(null);
const drawing = ref(false);
const sending = ref(false);
const activeComment = ref<{
  anchor: AnnotationPopupAnchor;
  annotationId: string;
  description: string;
  initialValue: string;
  isNew: boolean;
  placement: 'above' | 'below';
} | null>(null);
let annotationId = 0;
let imageLoadTimer: ReturnType<typeof setTimeout> | null = null;
let failedImageSource: string | null = null;

const imageScale = ref(1);
const canvasPadding = computed(() => Math.round(96 / imageScale.value));
const canvasSize = computed(() => ({
  width: imageSize.value.width + canvasPadding.value * 2,
  height: imageSize.value.height + canvasPadding.value * 2,
}));
const pixelRatio = computed<1 | 2>(() => (retinaMode.value ? 2 : 1));
const reportedImageSize = computed(() => ({
  width: imageSize.value.width / pixelRatio.value,
  height: imageSize.value.height / pixelRatio.value,
}));
const stageStyle = computed(() => ({
  aspectRatio: `${canvasSize.value.width} / ${canvasSize.value.height}`,
  width: `${canvasSize.value.width * imageScale.value * zoom.value}px`,
}));
const imageStyle = computed(() => ({
  height: `${imageSize.value.height / canvasSize.value.height * 100}%`,
  left: `${canvasPadding.value / canvasSize.value.width * 100}%`,
  top: `${canvasPadding.value / canvasSize.value.height * 100}%`,
  width: `${imageSize.value.width / canvasSize.value.width * 100}%`,
}));
const cursorPixel = computed(() => {
  const data = imageData.value;
  const point = hoverPoint.value;
  if (!data || !point) return null;
  const x = Math.floor(point.x - canvasPadding.value);
  const y = Math.floor(point.y - canvasPadding.value);
  if (x < 0 || x >= data.width || y < 0 || y >= data.height) return null;
  const index = (y * data.width + x) * 4;
  return {
    red: data.data[index] ?? 0,
    green: data.data[index + 1] ?? 0,
    blue: data.data[index + 2] ?? 0,
    alpha: data.data[index + 3] ?? 255,
  };
});
const cursorColorText = computed(() => {
  const pixel = cursorPixel.value;
  return pixel ? `${pixel.red}, ${pixel.green}, ${pixel.blue}` : '—';
});
const cursorSwatchStyle = computed(() => {
  const pixel = cursorPixel.value;
  return pixel
    ? { backgroundColor: `rgba(${pixel.red}, ${pixel.green}, ${pixel.blue}, ${pixel.alpha / 255})` }
    : {};
});

watch(() => props.visible, (visible) => {
  if (!visible) return;
  resetEditor();
  void nextTick(() => dialogBody.value?.focus());
});

watch(() => props.imageSrc, (source) => {
  resolvedImageSrc.value = source;
});

watch(() => props.initialPixelRatio, (nextPixelRatio) => {
  retinaMode.value = nextPixelRatio === 2;
  renderCanvas();
});

watch([() => props.visible, resolvedImageSrc], ([visible]) => {
  clearImageLoadTimer();
  failedImageSource = null;
  if (!visible) return;
  imageLoadTimer = setTimeout(imageFailed, 1_200);
}, { immediate: true });

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeyDown);
  window.addEventListener('resize', handleWindowResize);
});

onBeforeUnmount(() => {
  clearImageLoadTimer();
  window.removeEventListener('keydown', handleWindowKeyDown);
  window.removeEventListener('resize', handleWindowResize);
});

function onVisibilityChanged(visible: boolean): void {
  if (!visible) emit('close');
}

function focusDialog(): void {
  dialogBody.value?.focus();
  fitSourceImage();
  void nextTick(frameSourceImage);
}

function resetEditor(): void {
  annotations.value = [];
  draft.value = null;
  activeComment.value = null;
  activeTool.value = 'arrow';
  drawing.value = false;
  sending.value = false;
  imageScale.value = 1;
  zoom.value = 1;
  retinaMode.value = props.initialPixelRatio === 2;
  hoverPoint.value = null;
  annotationId = 0;
  renderCanvas();
}

function imageLoaded(): void {
  const element = image.value;
  if (!element) return;
  const width = element.naturalWidth || element.width;
  const height = element.naturalHeight || element.height;
  if (width <= 1 || height <= 1) {
    imageFailed();
    return;
  }
  clearImageLoadTimer();
  imageSize.value = {
    width,
    height,
  };
  void nextTick(() => {
    fitSourceImage();
    void nextTick(() => {
      captureImageData();
      renderCanvas();
      frameSourceImage();
    });
  });
}

function fitSourceImage(): void {
  const container = workspace.value;
  const availableWidth = container?.clientWidth || 820;
  const availableHeight = container?.clientHeight || 560;
  imageScale.value = Math.min(
    1,
    availableWidth / imageSize.value.width,
    availableHeight / imageSize.value.height,
  );
}

function handleWindowResize(): void {
  if (!props.visible) return;
  fitSourceImage();
  void nextTick(frameSourceImage);
}

function handleWorkspaceWheel(event: WheelEvent): void {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const container = workspace.value;
  const stageElement = stage.value;
  if (!container || !stageElement) return;

  const nextZoom = clamp(zoom.value * Math.exp(-event.deltaY * 0.01), 0.5, 3);
  if (nextZoom === zoom.value) return;
  const rect = stageElement.getBoundingClientRect();
  const anchorX = rect.width > 0 ? clamp((event.clientX - rect.left) / rect.width, 0, 1) : 0.5;
  const anchorY = rect.height > 0 ? clamp((event.clientY - rect.top) / rect.height, 0, 1) : 0.5;
  zoom.value = nextZoom;

  void nextTick(() => {
    const nextRect = stageElement.getBoundingClientRect();
    container.scrollLeft += nextRect.left + nextRect.width * anchorX - event.clientX;
    container.scrollTop += nextRect.top + nextRect.height * anchorY - event.clientY;
  });
}

function imageFailed(): void {
  clearImageLoadTimer();
  if (failedImageSource === resolvedImageSrc.value) return;
  failedImageSource = resolvedImageSrc.value;
  if (props.fallbackImageSrc && resolvedImageSrc.value !== props.fallbackImageSrc) {
    resolvedImageSrc.value = props.fallbackImageSrc;
  }
  emit('image-error');
}

function clearImageLoadTimer(): void {
  if (!imageLoadTimer) return;
  clearTimeout(imageLoadTimer);
  imageLoadTimer = null;
}

function captureImageData(): void {
  const element = image.value;
  if (!element) return;
  const source = document.createElement('canvas');
  source.width = imageSize.value.width;
  source.height = imageSize.value.height;
  const context = source.getContext('2d');
  if (!context) return;
  try {
    context.drawImage(element, 0, 0, source.width, source.height);
    imageData.value = context.getImageData(0, 0, source.width, source.height);
    refreshMeasurementPreview();
  } catch {
    imageData.value = null;
  }
}

function selectTool(tool: ImageAnnotationTool): void {
  activeTool.value = tool;
  drawing.value = false;
  refreshMeasurementPreview();
  canvas.value?.focus();
}

function toggleRetinaMode(): void {
  retinaMode.value = !retinaMode.value;
  if (activeComment.value) {
    const annotation = annotations.value.find(({ id }) => id === activeComment.value?.annotationId);
    if (annotation) activeComment.value.description = annotationDescription(annotation);
  }
  renderCanvas();
}

function startDrawing(event: PointerEvent): void {
  if (activeComment.value) return;
  const point = imagePoint(event);
  if (!point) return;
  if (isMeasurementTool(activeTool.value) && !isInsideImage(point)) return;
  hoverPoint.value = point;
  drawing.value = true;
  canvas.value?.setPointerCapture?.(event.pointerId);
  draft.value = createDraft(point, annotations.value.length + 1);
  renderCanvas();
}

function continueDrawing(event: PointerEvent): void {
  if (drawing.value) autoScrollWorkspace(event);
  const point = imagePoint(event);
  if (!point) return;
  hoverPoint.value = point;
  if (!drawing.value) {
    refreshMeasurementPreview();
    return;
  }

  const current = draft.value;
  if (!current) return;
  draft.value = isMeasurementTool(activeTool.value)
    ? createDraft(point, current.number, current.id)
    : { ...current, end: point };
  renderCanvas();
}

function frameSourceImage(): void {
  const container = workspace.value;
  const stageElement = stage.value;
  if (!container || !stageElement) return;
  const displayedScale = stageElement.getBoundingClientRect().width / canvasSize.value.width;
  if (!Number.isFinite(displayedScale) || displayedScale <= 0) return;
  const imageWidth = imageSize.value.width * displayedScale;
  const imageHeight = imageSize.value.height * displayedScale;
  const imageLeft = stageElement.offsetLeft + canvasPadding.value * displayedScale;
  const imageTop = stageElement.offsetTop + canvasPadding.value * displayedScale;
  container.scrollLeft = Math.max(0, imageLeft - Math.max(0, container.clientWidth - imageWidth) / 2);
  container.scrollTop = Math.max(0, imageTop - Math.max(0, container.clientHeight - imageHeight) / 2);
}

function autoScrollWorkspace(event: PointerEvent): void {
  const container = workspace.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const edge = 32;
  const horizontal = edgeScrollDelta(event.clientX, rect.left, rect.right, edge);
  const vertical = edgeScrollDelta(event.clientY, rect.top, rect.bottom, edge);
  if (horizontal === 0 && vertical === 0) return;
  container.scrollBy({ left: horizontal, top: vertical, behavior: 'auto' });
}

function edgeScrollDelta(position: number, start: number, end: number, edge: number): number {
  if (position < start + edge) return -clamp(Math.ceil((start + edge - position) / 2), 4, 28);
  if (position > end - edge) return clamp(Math.ceil((position - (end - edge)) / 2), 4, 28);
  return 0;
}

function finishDrawing(event: PointerEvent): void {
  if (!drawing.value) return;
  const point = imagePoint(event);
  const current = draft.value;
  if (point) hoverPoint.value = point;
  drawing.value = false;
  canvas.value?.releasePointerCapture?.(event.pointerId);
  if (!current || !point) {
    draft.value = null;
    renderCanvas();
    return;
  }

  const completed = isMeasurementTool(current.tool)
    ? createDraft(point, current.number, current.id)
    : { ...current, end: point };
  draft.value = null;
  if (!isDrawableAnnotation(completed)) {
    renderCanvas();
    return;
  }
  annotations.value = [...annotations.value, completed];
  renderCanvas();
  void nextTick(() => openComment(completed, true));
}

function leaveCanvas(): void {
  hoverPoint.value = null;
  if (!drawing.value && isMeasurementTool(activeTool.value)) {
    draft.value = null;
    renderCanvas();
  }
}

function createDraft(point: ImageAnnotationPoint, number: number, existingId?: string): ImageAnnotation {
  if (number > 0 && !existingId) annotationId += 1;
  const id = existingId ?? (number > 0 ? `image-annotation-${annotationId}` : 'image-annotation-preview');
  if (isMeasurementTool(activeTool.value)) {
    const imagePoint = {
      x: point.x - canvasPadding.value,
      y: point.y - canvasPadding.value,
    };
    const measurement = measurementAnnotation(
      imageData.value,
      imagePoint,
      activeTool.value,
      imageSize.value.width,
      imageSize.value.height,
    );
    return {
      id,
      number,
      comment: '',
      ...measurement,
      start: {
        x: measurement.start.x + canvasPadding.value,
        y: measurement.start.y + canvasPadding.value,
      },
      end: {
        x: measurement.end.x + canvasPadding.value,
        y: measurement.end.y + canvasPadding.value,
      },
    };
  }
  return { id, number, comment: '', tool: activeTool.value, start: point, end: point };
}

function isInsideImage(point: ImageAnnotationPoint): boolean {
  const padding = canvasPadding.value;
  return point.x >= padding
    && point.x <= padding + imageSize.value.width
    && point.y >= padding
    && point.y <= padding + imageSize.value.height;
}

function refreshMeasurementPreview(): void {
  if (drawing.value) return;
  draft.value = isMeasurementTool(activeTool.value)
    && hoverPoint.value
    && isInsideImage(hoverPoint.value)
    && !activeComment.value
    ? createDraft(hoverPoint.value, 0)
    : null;
  renderCanvas();
}

function imagePoint(event: PointerEvent): ImageAnnotationPoint | null {
  const element = canvas.value;
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: clamp((event.clientX - rect.left) * (element.width / rect.width), 0, element.width),
    y: clamp((event.clientY - rect.top) * (element.height / rect.height), 0, element.height),
  };
}

function renderCanvas(): void {
  const element = canvas.value;
  const context = element?.getContext('2d');
  if (!element || !context) return;
  drawImageAnnotations(
    context,
    draft.value ? [...annotations.value, draft.value] : annotations.value,
    {
      width: element.width,
      height: element.height,
      palette: canvasPalette(),
      pixelRatio: pixelRatio.value,
    },
  );
}

function canvasPalette(): ImageAnnotationPalette {
  const styles = dialogBody.value ? getComputedStyle(dialogBody.value) : null;
  const stroke = styles?.getPropertyValue('--color-error').trim();
  const halo = styles?.getPropertyValue('--color-surface-lowest').trim();
  return {
    ...defaultImageAnnotationPalette,
    ...(stroke ? { stroke, labelFill: stroke } : {}),
    ...(halo ? { halo } : {}),
  };
}

function openComment(annotation: ImageAnnotation, isNew = false): void {
  activeComment.value = {
    annotationId: annotation.id,
    anchor: popupAnchor(annotation),
    description: annotationDescription(annotation),
    initialValue: annotation.comment,
    isNew,
    placement: annotationAnchor(annotation).y > canvasSize.value.height * 0.6 ? 'above' : 'below',
  };
}

function editComment(annotation: ImageAnnotation): void {
  openComment(annotation);
}

function saveComment(comment: string): void {
  const target = activeComment.value;
  if (!target) return;
  annotations.value = annotations.value.map((annotation) => (
    annotation.id === target.annotationId ? { ...annotation, comment } : annotation
  ));
  activeComment.value = null;
  refreshMeasurementPreview();
}

function cancelComment(): void {
  const target = activeComment.value;
  activeComment.value = null;
  if (target?.isNew) {
    annotations.value = annotations.value
      .filter((annotation) => annotation.id !== target.annotationId)
      .map((annotation, index) => ({ ...annotation, number: index + 1 }));
  }
  refreshMeasurementPreview();
  canvas.value?.focus();
}

function popupAnchor(annotation: ImageAnnotation): AnnotationPopupAnchor {
  const element = canvas.value;
  if (!element) return { x: 12, y: 12, width: 0, height: 0 };
  const point = annotationAnchor(annotation);
  const canvasRect = element.getBoundingClientRect();
  return {
    x: canvasRect.left + point.x * (canvasRect.width / element.width),
    y: canvasRect.top + point.y * (canvasRect.height / element.height),
    width: 0,
    height: 0,
  };
}

function annotationDescription(annotation: ImageAnnotation): string {
  const measurement = annotationPixelLength(annotation, pixelRatio.value);
  return measurement === null
    ? `${toolLabel(annotation.tool)} annotation ${annotation.number}`
    : `${toolLabel(annotation.tool)} annotation ${annotation.number}: ${measurement}px`;
}

function removeAnnotation(annotationIdToRemove: string): void {
  annotations.value = annotations.value
    .filter((annotation) => annotation.id !== annotationIdToRemove)
    .map((annotation, index) => ({ ...annotation, number: index + 1 }));
  if (activeComment.value?.annotationId === annotationIdToRemove) activeComment.value = null;
  renderCanvas();
}

function undoLastAnnotation(): void {
  const removed = annotations.value.at(-1);
  if (!removed) return;
  removeAnnotation(removed.id);
}

function clearAnnotations(): void {
  annotations.value = [];
  activeComment.value = null;
  refreshMeasurementPreview();
}

async function sendAnnotatedImage(): Promise<void> {
  if (annotations.value.length === 0 || sending.value) return;
  const element = image.value;
  if (!element) return;
  sending.value = true;
  try {
    const output = document.createElement('canvas');
    output.width = canvasSize.value.width;
    output.height = canvasSize.value.height;
    const context = output.getContext('2d');
    if (!context) return;
    context.drawImage(
      element,
      canvasPadding.value,
      canvasPadding.value,
      imageSize.value.width,
      imageSize.value.height,
    );
    drawImageAnnotations(context, annotations.value, {
      clear: false,
      width: output.width,
      height: output.height,
      palette: canvasPalette(),
      pixelRatio: pixelRatio.value,
    });
    emit('send', {
      annotations: annotations.value.map((annotation) => ({
        ...annotation,
        start: { ...annotation.start },
        end: { ...annotation.end },
      })),
      dataUrl: output.toDataURL('image/png'),
      fileName: props.fileName,
      width: output.width,
      height: output.height,
      pixelRatio: pixelRatio.value,
    });
  } finally {
    sending.value = false;
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (event.key === 'Escape' && activeComment.value) {
    event.preventDefault();
    event.stopPropagation();
    cancelComment();
    return;
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'Tab' && cursorPixel.value) {
    event.preventDefault();
    void copyCursorColor();
    return;
  }
  if (event.metaKey && (event.key === '+' || event.key === '=' || event.code === 'Equal')) {
    event.preventDefault();
    zoom.value = clamp(zoom.value + 0.25, 0.5, 3);
    return;
  }
  if (event.metaKey && (event.key === '-' || event.key === '_' || event.code === 'Minus')) {
    event.preventDefault();
    zoom.value = clamp(zoom.value - 0.25, 0.5, 3);
    return;
  }
  const shortcut = event.key.toLowerCase();
  const tool = tools.find((candidate) => candidate.shortcut === shortcut);
  if (tool) {
    event.preventDefault();
    selectTool(tool.id);
    return;
  }
  if (event.key === 'Backspace' || event.key === 'Delete') {
    event.preventDefault();
    undoLastAnnotation();
  }
}

async function copyCursorColor(): Promise<void> {
  if (!cursorPixel.value || !navigator.clipboard?.writeText) return;
  await navigator.clipboard.writeText(cursorColorText.value);
}

function handleWindowKeyDown(event: KeyboardEvent): void {
  if (!props.visible || event.defaultPrevented) return;
  handleKeyDown(event);
}

function toolLabel(tool: ImageAnnotationTool): string {
  return tools.find((candidate) => candidate.id === tool)?.label ?? 'Annotation';
}

function toolTooltip(tool: ToolItem): string {
  return `${tool.label} (${tool.shortcut.toUpperCase()})`;
}

function isMeasurementTool(tool: ImageAnnotationTool): tool is 'measure-horizontal' | 'measure-vertical' {
  return tool === 'measure-horizontal' || tool === 'measure-vertical';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
</script>

<style scoped>
:global(.image-annotation-dialog.el-dialog > .el-dialog__header) {
  padding-left: var(--space-12);
}

:global(.image-annotation-dialog.el-dialog) {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

:global(.image-annotation-dialog.el-dialog > .el-dialog__body) {
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

:global(.image-annotation-dialog.el-dialog > .el-dialog__footer) {
  padding: var(--space-3) var(--space-4);
}

.image-annotation-dialog__header {
  align-items: center;
}

.image-annotation-dialog__header-main {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  min-width: 0;
}

.image-annotation-dialog__header-trailing,
.image-annotation-dialog__inspector,
.image-annotation-dialog__inspector-item,
.image-annotation-dialog__inspector-color {
  display: flex;
  align-items: center;
}

.image-annotation-dialog__header-trailing {
  gap: var(--space-8);
  margin-left: auto;
  padding-right: var(--space-4);
}

.image-annotation-dialog__inspector {
  min-width: 0;
}

.image-annotation-dialog__inspector-item {
  display: grid;
  gap: 1px;
  min-width: 76px;
  padding: 0 var(--space-6);
  border-left: 1px solid var(--color-border);
  line-height: var(--line-height-16);
}

.image-annotation-dialog__inspector-item:first-child {
  border-left: 0;
}

.image-annotation-dialog__inspector-item:last-child {
  min-width: 0;
  padding-right: 0;
}

.image-annotation-dialog__inspector-item strong,
.image-annotation-dialog__inspector-item small {
  display: block;
  white-space: nowrap;
}

.image-annotation-dialog__inspector-item strong {
  color: var(--color-text);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
}

.image-annotation-dialog__inspector-item small {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

.image-annotation-dialog__inspector-color {
  display: flex;
  gap: var(--space-3);
  min-width: 118px;
}

.image-annotation-dialog__color-swatch {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background-color: var(--color-surface-lowest);
  background-image:
    linear-gradient(45deg, var(--color-surface-low) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-surface-low) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-surface-low) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-surface-low) 75%);
  background-position: 0 0, 0 4px, 4px -4px, -4px 0;
  background-size: 8px 8px;
}

.image-annotation-dialog__color-swatch--sampled {
  background-image: none;
}

.image-annotation-dialog__body {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
  outline: 0;
}

.image-annotation-dialog__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.image-annotation-dialog__toolbar-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.image-annotation-dialog__tool {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.image-annotation-dialog__tool:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.image-annotation-dialog__tool--active {
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.image-annotation-dialog__tool:disabled {
  opacity: 0.32;
  cursor: default;
}

.image-annotation-dialog__tool svg {
  width: 21px;
  height: 21px;
}

.image-annotation-dialog__tool--retina {
  width: auto;
  min-width: 36px;
  padding: 0 var(--space-2);
  font-size: var(--font-size-11);
  font-weight: var(--font-weight-semibold);
}

.image-annotation-dialog__toolbar-separator {
  width: 1px;
  height: 24px;
  margin: 0 var(--space-2);
  background: var(--color-border);
}

.image-annotation-dialog__content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--color-surface-low);
}

.image-annotation-dialog__workspace {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: safe center;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--space-4);
  scrollbar-width: none;
  background-color: var(--color-surface-base);
  background-image:
    linear-gradient(45deg, var(--color-surface-low) 25%, transparent 25%),
    linear-gradient(-45deg, var(--color-surface-low) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--color-surface-low) 75%),
    linear-gradient(-45deg, transparent 75%, var(--color-surface-low) 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
}

.image-annotation-dialog__workspace::-webkit-scrollbar {
  display: none;
}

.image-annotation-dialog__stage {
  position: relative;
  flex: 0 0 auto;
  max-width: none;
  overflow: visible;
  user-select: none;
}

.image-annotation-dialog__canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  outline: 0;
  touch-action: none;
}

.image-annotation-dialog__image {
  position: absolute;
  display: block;
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
  object-fit: contain;
  pointer-events: none;
}

.image-annotation-dialog__stage--arrow .image-annotation-dialog__canvas,
.image-annotation-dialog__stage--oval .image-annotation-dialog__canvas,
.image-annotation-dialog__stage--rectangle .image-annotation-dialog__canvas {
  cursor: crosshair;
}

.image-annotation-dialog__comments {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface-lowest);
}

.image-annotation-dialog__comment-list {
  display: grid;
  grid-auto-rows: max-content;
  align-content: start;
  gap: var(--space-1);
  margin: 0;
  padding: var(--space-2);
  overflow-y: auto;
  list-style: none;
}

.image-annotation-dialog__comments-empty {
  display: grid;
  place-items: center;
  padding: var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  text-align: center;
}

.image-annotation-dialog__comment-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  border-radius: var(--radius-lg);
}

.image-annotation-dialog__comment-list li:hover {
  background: var(--color-surface-low);
}

.image-annotation-dialog__comment {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: var(--space-2);
  min-width: 0;
  padding: var(--space-3);
  border: 0;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.image-annotation-dialog__comment-number {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--color-error);
  color: var(--color-on-error);
  font-size: var(--font-size-11);
  font-weight: var(--font-weight-semibold);
}

.image-annotation-dialog__comment strong,
.image-annotation-dialog__comment small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.image-annotation-dialog__comment strong {
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
}

.image-annotation-dialog__comment small {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  line-height: var(--line-height-16);
  white-space: nowrap;
}

.image-annotation-dialog__comment-remove {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin: var(--space-2) var(--space-1) 0 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.image-annotation-dialog__comment-remove:hover {
  color: var(--color-error);
  background: var(--color-error-container);
}

.image-annotation-dialog__comment-remove svg {
  width: 15px;
  height: 15px;
}

.image-annotation-dialog__footer :deep(.annotation-send-button) {
  --annotation-send-button-height: 32px;
}

@media (max-width: 820px) {
  .image-annotation-dialog__content {
    grid-template-columns: minmax(0, 1fr);
  }

  .image-annotation-dialog__comments {
    display: none;
  }

}
</style>
