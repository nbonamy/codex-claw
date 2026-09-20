<template>
  <section ref="panelRoot" class="mission-requirement-review" :aria-label="t('missions.requirementReview')">
    <div class="mission-requirement-review__document">
      <MarkdownPanel :content="content" @mouseup="captureSelection" />
      <AnnotationPopup
        v-if="activeTarget"
        :anchor="activeTarget.anchor"
        :description="activeTarget.quote"
        :initial-value="activeTarget.initialValue"
        :label="t('missions.requirementCommentLabel')"
        :placement="activeTarget.placement"
        :placeholder="t('missions.requirementCommentPlaceholder')"
        :submit-label="t('missions.saveRequirementComment')"
        :width="activeTarget.width"
        @cancel="cancelComment"
        @submit="saveComment"
      />
    </div>

    <footer class="mission-requirement-review__footer">
      <p v-if="comments.length === 0" class="mission-requirement-review__help">
        <IconCirclePlus aria-hidden="true" />
        <span>{{ t('missions.requirementCommentHelp') }}</span>
      </p>
      <div v-else class="mission-requirement-review__comments" :aria-label="t('missions.requirementComments')">
        <article v-for="comment in comments" :key="comment.id" class="mission-requirement-review__comment">
          <button type="button" :aria-label="t('missions.editRequirementComment')" :disabled="disabled" @click="editComment(comment)">
            <span>{{ oneLine(comment.quote) }}</span>
            <small>{{ oneLine(comment.body) }}</small>
          </button>
          <button type="button" class="mission-requirement-review__remove" :aria-label="t('missions.removeRequirementComment')" :disabled="disabled" @click="removeComment(comment.id)">
            <Trash2Icon aria-hidden="true" />
          </button>
        </article>
      </div>
      <AnnotationSendButton
        v-if="comments.length"
        :count="comments.length"
        :disabled="disabled"
        :label="t('missions.sendRequirementComments', comments.length)"
        @click="emit('sendComments', comments)"
      />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconCirclePlus } from '@tabler/icons-vue';
import { Trash2Icon } from '../shared/icons/app-icons';
import AnnotationPopup, { type AnnotationPopupAnchor } from './AnnotationPopup.vue';
import AnnotationSendButton from './AnnotationSendButton.vue';
import MarkdownPanel from './MarkdownPanel.vue';

export type MissionRequirementComment = { id: string; quote: string; body: string };

const props = withDefaults(defineProps<{
  content: string;
  disabled?: boolean;
  resetKey?: number;
}>(), { disabled: false, resetKey: 0 });
const emit = defineEmits<{ sendComments: [comments: MissionRequirementComment[]] }>();
const { t } = useI18n();
const panelRoot = ref<HTMLElement | null>(null);
const comments = ref<MissionRequirementComment[]>([]);
const activeTarget = ref<{
  anchor: AnnotationPopupAnchor;
  initialValue: string;
  placement: 'above' | 'below';
  quote: string;
  width?: number;
} | null>(null);
const editingId = ref<string | null>(null);
let commentId = 0;

watch(() => [props.content, props.resetKey], () => {
  comments.value = [];
  cancelComment();
});

function captureSelection(event: MouseEvent): void {
  if (props.disabled) return;
  const selection = window.getSelection?.();
  const quote = selection?.toString().trim() ?? '';
  if (!selection || !quote || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const panel = event.currentTarget instanceof HTMLElement
    ? event.currentTarget.closest('.mission-requirement-review')
    : null;
  if (!panel || !panel.contains(range.commonAncestorContainer)) return;
  const rangeRect = range.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  activeTarget.value = {
    quote: quote.length > 180 ? `${quote.slice(0, 177)}...` : quote,
    initialValue: '',
    placement: 'below',
    anchor: {
      x: Math.min(Math.max(12, rangeRect.left - panelRect.left), Math.max(12, panelRect.width - 332)),
      y: Math.max(48, rangeRect.top - panelRect.top),
      width: rangeRect.width,
      height: rangeRect.height,
    },
  };
}

function saveComment(body: string): void {
  const target = activeTarget.value;
  if (!target) return;
  commentId += 1;
  const next = { id: editingId.value ?? `requirement-comment-${commentId}`, quote: target.quote, body };
  comments.value = editingId.value
    ? comments.value.map(comment => comment.id === editingId.value ? next : comment)
    : [...comments.value, next];
  cancelComment();
  window.getSelection?.()?.removeAllRanges();
}

function editComment(comment: MissionRequirementComment): void {
  if (props.disabled) return;
  const panel = panelRoot.value;
  const panelRect = panel?.getBoundingClientRect();
  const footerRect = panel?.querySelector<HTMLElement>('.mission-requirement-review__footer')?.getBoundingClientRect();
  const width = panelRect?.width || panel?.clientWidth || 0;
  editingId.value = comment.id;
  activeTarget.value = {
    quote: comment.quote,
    initialValue: comment.body,
    placement: 'above',
    ...(width > 24 ? { width: width - 24 } : {}),
    anchor: { x: 12, y: panelRect && footerRect ? footerRect.top - panelRect.top : 72, width: 0, height: 0 },
  };
}

function removeComment(id: string): void {
  if (props.disabled) return;
  comments.value = comments.value.filter(comment => comment.id !== id);
  if (editingId.value === id) cancelComment();
}

function cancelComment(): void {
  activeTarget.value = null;
  editingId.value = null;
}

function oneLine(value: string): string { return value.replace(/\s+/g, ' ').trim(); }
</script>

<style scoped>
.mission-requirement-review { position: relative; overflow: hidden; border: 1px solid var(--color-border); border-radius: var(--radius-xl); background: var(--color-surface-lowest); box-shadow: var(--shadow-sm); }
.mission-requirement-review__document :deep(.markdown-panel) { padding: var(--space-10); }
.mission-requirement-review__footer { --annotation-send-button-height: var(--space-16); display: flex; align-items: center; gap: var(--space-4); min-height: 52px; padding: var(--space-4) var(--space-6); border-top: 1px solid var(--color-border); background: var(--color-surface-low); }
.mission-requirement-review__help { display: flex; flex: 1; align-items: center; gap: var(--space-2); color: var(--color-text-muted); font-size: var(--font-size-12); }
.mission-requirement-review__help svg { width: var(--icon-sm); height: var(--icon-sm); }
.mission-requirement-review__comments { display: flex; min-width: 0; flex: 1; gap: var(--space-3); overflow-x: auto; }
.mission-requirement-review__comment { display: flex; min-width: 180px; max-width: 280px; align-items: center; border: 1px solid color-mix(in srgb, var(--color-primary) 20%, var(--color-border)); border-radius: var(--radius-md); background: var(--color-surface-lowest); }
.mission-requirement-review__comment > button:first-child { display: grid; min-width: 0; flex: 1; gap: 1px; padding: var(--space-2) var(--space-3); overflow: hidden; border: 0; color: var(--color-text); background: transparent; text-align: left; cursor: pointer; }
.mission-requirement-review__comment span, .mission-requirement-review__comment small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mission-requirement-review__comment span { font-size: var(--font-size-12); font-weight: var(--font-weight-semibold); }
.mission-requirement-review__comment small { color: var(--color-text-muted); font-size: var(--font-size-11); }
.mission-requirement-review__remove { display: grid; width: 30px; align-self: stretch; place-items: center; border: 0; border-left: 1px solid var(--color-border); color: var(--color-text-muted); background: transparent; cursor: pointer; }
.mission-requirement-review__remove svg { width: var(--icon-sm); height: var(--icon-sm); }
.mission-requirement-review button:disabled { opacity: .5; cursor: default; }
</style>
