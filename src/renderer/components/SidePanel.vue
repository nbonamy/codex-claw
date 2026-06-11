<template>
  <aside
    class="side-panel"
    aria-label="Side panel"
    :style="sidePanelStyle"
  >
    <div
      class="side-panel__resize-handle"
      role="separator"
      aria-label="Resize preview panel"
      aria-orientation="vertical"
      @pointerdown="startResize"
      @pointermove="resizePanel"
      @pointerup="stopResize"
      @pointercancel="stopResize"
    />
    <header class="side-panel__header">
      <div class="side-panel__title-group">
        <FileTextIcon
          v-if="panel.kind === 'markdown'"
          class="side-panel__icon"
          aria-hidden="true"
        />
        <CodeIcon
          v-else-if="panel.kind === 'source'"
          class="side-panel__icon"
          aria-hidden="true"
        />
        <FileDiffIcon
          v-else-if="panel.kind === 'gitDiff'"
          class="side-panel__icon"
          aria-hidden="true"
        />
        <div class="side-panel__copy">
          <h2>{{ panel.title }}</h2>
          <p v-if="panel.subtitle">{{ panel.subtitle }}</p>
        </div>
      </div>
      <button
        class="side-panel__close"
        type="button"
        aria-label="Close side panel"
        @click="emit('close')"
      >
        <X aria-hidden="true" />
      </button>
    </header>

    <div
      v-if="panel.kind === 'markdown'"
      class="side-panel__markdown-frame"
    >
      <MarkdownPanel
        :content="panel.content"
        :error="panel.error"
        :state="panel.state"
        @mouseup="capturePlanSelection"
      />
      <div
        v-if="isPlanUpdating"
        class="side-panel__plan-overlay"
        aria-live="polite"
      >
        <span class="side-panel__plan-spinner" aria-hidden="true" />
        <span>{{ t('chat.planReview.updating') }}</span>
      </div>
    </div>

    <SourcePreviewPanel
      v-else-if="panel.kind === 'source'"
      :content="panel.content"
      :error="panel.error"
      :language="panel.language"
      :state="panel.state"
    />

    <GitDiffPreviewPanel
      v-else-if="panel.kind === 'gitDiff'"
      :diff="panel.diff"
      :error="panel.error"
      :state="panel.state"
    />

    <form
      v-if="activeCommentTarget"
      class="side-panel__comment-box"
      :style="commentBoxStyle"
      @submit.prevent="savePlanComment"
    >
      <label
        class="side-panel__comment-label"
        for="plan-comment"
      >
        {{ t('chat.planReview.commentLabel') }}
      </label>
      <blockquote>{{ activeCommentTarget.quote }}</blockquote>
      <textarea
        id="plan-comment"
        ref="commentInput"
        v-model="commentDraft"
        class="side-panel__comment-input"
        :placeholder="t('chat.planReview.commentPlaceholder')"
        rows="3"
      />
      <div class="side-panel__comment-actions">
        <button
          type="button"
          class="side-panel__comment-button"
          @click="cancelPlanComment"
        >
          {{ t('chat.planReview.commentCancel') }}
        </button>
        <button
          type="submit"
          class="side-panel__comment-button side-panel__comment-button--primary"
          :disabled="!commentDraft.trim()"
        >
          {{ t('chat.planReview.commentSave') }}
        </button>
      </div>
    </form>

    <PlanReviewFooter
      v-if="panel.kind === 'markdown' && panel.purpose === 'plan' && panel.state === 'idle'"
      :comments="planComments"
      :show-comment-help="showCommentHelp"
      @confirm="emit('confirmPlan')"
      @comment="handleCommentAction"
      @delete-comment="deletePlanComment"
      @edit-comment="editPlanComment"
      @cancel="emit('cancelPlan')"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import GitDiffPreviewPanel from './GitDiffPreviewPanel.vue';
import MarkdownPanel from './MarkdownPanel.vue';
import PlanReviewFooter from './PlanReviewFooter.vue';
import SourcePreviewPanel from './SourcePreviewPanel.vue';
import { CodeIcon, FileDiffIcon, FileTextIcon, X } from '../shared/icons/app-icons';
import type { PlanReviewComment, SidePanelState } from './side-panel';

const props = defineProps<{
  panel: SidePanelState;
  planUpdating?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirmPlan: [];
  commentPlan: [comments: PlanReviewComment[]];
  cancelPlan: [];
}>();

const { t } = useI18n();
const commentInput = ref<HTMLTextAreaElement | null>(null);
const planComments = ref<PlanReviewComment[]>([]);
const showCommentHelp = ref(false);
const commentDraft = ref('');
const activeCommentTarget = ref<{ quote: string; top: number; left: number } | null>(null);
const editingCommentId = ref<string | null>(null);
const panelWidth = ref<number | null>(null);
const resizeStart = ref<{ pointerId: number; startX: number; startWidth: number } | null>(null);
let commentId = 0;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH_RATIO = 0.72;
const isPlanUpdating = computed(() => props.planUpdating === true && props.panel.kind === 'markdown' && props.panel.purpose === 'plan');
const sidePanelStyle = computed(() => (panelWidth.value ? {
  '--side-panel-width': `${panelWidth.value}px`,
} : {}));

const commentBoxStyle = computed(() => {
  if (!activeCommentTarget.value) {
    return {};
  }

  return {
    top: `${activeCommentTarget.value.top}px`,
    left: `${activeCommentTarget.value.left}px`,
  };
});

watch(() => {
  if (props.panel.kind === 'markdown') {
    return [props.panel.kind, props.panel.title, props.panel.content, props.panel.purpose];
  }
  if (props.panel.kind === 'source') {
    return [props.panel.kind, props.panel.title, props.panel.content];
  }
  return [props.panel.kind, props.panel.title, props.panel.diff];
}, () => {
  planComments.value = [];
  showCommentHelp.value = false;
  cancelPlanComment();
});

function capturePlanSelection(event: MouseEvent): void {
  if (isPlanUpdating.value || props.panel.kind !== 'markdown' || props.panel.purpose !== 'plan' || props.panel.state !== 'idle') {
    return;
  }

  const selection = window.getSelection?.();
  const quote = selection?.toString().trim() ?? '';
  if (!selection || !quote || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  const panelElement = event.currentTarget instanceof HTMLElement
    ? event.currentTarget.closest('.side-panel')
    : null;
  if (!panelElement || !panelElement.contains(range.commonAncestorContainer)) {
    return;
  }

  const rangeRect = range.getBoundingClientRect();
  const panelRect = panelElement.getBoundingClientRect();
  activeCommentTarget.value = {
    quote: quote.length > 180 ? `${quote.slice(0, 177)}...` : quote,
    top: Math.max(56, rangeRect.bottom - panelRect.top + 8),
    left: Math.min(Math.max(12, rangeRect.left - panelRect.left), Math.max(12, panelRect.width - 300)),
  };
  showCommentHelp.value = false;

  void nextTick(() => {
    commentInput.value?.focus();
  });
}

function savePlanComment(): void {
  const target = activeCommentTarget.value;
  const body = commentDraft.value.trim();
  if (!target || !body) {
    return;
  }

  commentId += 1;
  const nextComment = {
    id: editingCommentId.value ?? `plan-comment-${commentId}`,
    quote: target.quote,
    body,
  };

  planComments.value = editingCommentId.value
    ? planComments.value.map((comment) => (comment.id === editingCommentId.value ? nextComment : comment))
    : [
        ...planComments.value,
        nextComment,
      ];
  cancelPlanComment();
  window.getSelection?.()?.removeAllRanges();
}

function editPlanComment(comment: PlanReviewComment): void {
  editingCommentId.value = comment.id;
  commentDraft.value = comment.body;
  activeCommentTarget.value = {
    quote: comment.quote,
    top: 72,
    left: 12,
  };
  showCommentHelp.value = false;

  void nextTick(() => {
    commentInput.value?.focus();
  });
}

function deletePlanComment(commentIdToDelete: string): void {
  planComments.value = planComments.value.filter((comment) => comment.id !== commentIdToDelete);
  if (editingCommentId.value === commentIdToDelete) {
    cancelPlanComment();
  }
}

function resetPlanComments(): void {
  planComments.value = [];
  showCommentHelp.value = false;
  cancelPlanComment();
}

function cancelPlanComment(): void {
  activeCommentTarget.value = null;
  commentDraft.value = '';
  editingCommentId.value = null;
}

function handleCommentAction(): void {
  if (planComments.value.length === 0) {
    showCommentHelp.value = true;
    return;
  }

  emit('commentPlan', planComments.value);
  resetPlanComments();
}

function startResize(event: PointerEvent): void {
  const resizeHandle = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const panelElement = resizeHandle
    ? resizeHandle.closest('.side-panel')
    : null;
  if (!(panelElement instanceof HTMLElement)) {
    return;
  }

  event.preventDefault();
  resizeHandle?.setPointerCapture?.(event.pointerId);
  resizeStart.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startWidth: panelElement.getBoundingClientRect().width,
  };
}

function resizePanel(event: PointerEvent): void {
  const resize = resizeStart.value;
  if (!resize || resize.pointerId !== event.pointerId) {
    return;
  }

  const maxWidth = Math.max(MIN_PANEL_WIDTH, Math.round(window.innerWidth * MAX_PANEL_WIDTH_RATIO));
  panelWidth.value = clamp(resize.startWidth + resize.startX - event.clientX, MIN_PANEL_WIDTH, maxWidth);
}

function stopResize(event: PointerEvent): void {
  const resize = resizeStart.value;
  if (!resize || resize.pointerId !== event.pointerId) {
    return;
  }

  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }
  resizeStart.value = null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
</script>

<style scoped>
.side-panel {
  --side-panel-default-width: min(38vw, 520px);
  position: relative;
  flex: 0 0 var(--side-panel-width, var(--side-panel-default-width));
  width: var(--side-panel-width, var(--side-panel-default-width));
  min-width: 320px;
  max-width: 72vw;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface-lowest);
}

.side-panel__resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  z-index: 5;
  width: 6px;
  cursor: col-resize;
  touch-action: none;
}

.side-panel__resize-handle::after {
  content: "";
  position: absolute;
  inset: 0 2px;
  background: transparent;
  transition: background-color 120ms ease;
}

.side-panel__resize-handle:hover::after,
.side-panel__resize-handle:focus-visible::after {
  background: var(--color-primary);
}

.side-panel__header {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  border-bottom: 1px solid var(--color-border);
}

.side-panel__title-group {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
}

.side-panel__icon {
  flex: 0 0 auto;
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.side-panel__copy {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.side-panel__copy h2,
.side-panel__copy p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-panel__copy h2 {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.side-panel__copy p {
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
}

.side-panel__close {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--space-12);
  height: var(--space-12);
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.side-panel__close:hover {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.side-panel__close svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.side-panel__markdown-frame {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}

.side-panel__plan-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  color: var(--color-text);
  background: color-mix(in srgb, var(--color-surface-lowest) 72%, transparent);
  backdrop-filter: blur(3px);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
  font-weight: var(--font-weight-semibold);
}

.side-panel__plan-spinner {
  width: var(--space-8);
  height: var(--space-8);
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-full);
  animation: side-panel-plan-spinner 900ms linear infinite;
}

.side-panel__comment-box {
  position: absolute;
  z-index: 3;
  width: min(296px, calc(100% - var(--space-16)));
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
}

.side-panel__comment-label {
  color: var(--color-text);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
}

.side-panel__comment-box blockquote {
  margin: 0;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-panel__comment-input {
  width: 100%;
  resize: vertical;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  font: inherit;
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.side-panel__comment-input:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.side-panel__comment-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

.side-panel__comment-button {
  height: var(--space-12);
  padding: 0 var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.side-panel__comment-button:disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
  opacity: 0.65;
}

.side-panel__comment-button:not(:disabled):hover {
  background: var(--color-surface-low);
}

.side-panel__comment-button--primary {
  border-color: var(--color-primary);
  color: var(--color-on-primary);
  background: var(--color-primary);
}

.side-panel__comment-button--primary:not(:disabled):hover {
  background: var(--color-on-primary-container);
}

@keyframes side-panel-plan-spinner {
  to {
    transform: rotate(1turn);
  }
}

@media (width < 1000px) {
  .side-panel {
    --side-panel-default-width: 360px;
  }
}
</style>
