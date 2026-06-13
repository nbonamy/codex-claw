<template>
  <footer class="plan-review-footer">
    <div class="plan-review-footer__status">
      <p
        v-if="showCommentHelp"
        class="plan-review-footer__help"
      >
        {{ t('chat.planReview.commentHelp') }}
      </p>
      <p
        v-else-if="comments.length"
        class="plan-review-footer__count"
      >
        {{ t('chat.planReview.commentsCount', comments.length) }}
      </p>
    </div>

    <div
      v-if="comments.length"
      class="plan-review-footer__comments"
      aria-label="Plan comments"
    >
      <article
        v-for="comment in comments"
        :key="comment.id"
        class="plan-review-footer__comment"
        :title="commentTitle(comment)"
      >
        <div class="plan-review-footer__comment-copy">
          <blockquote>{{ oneLineText(comment.quote) }}</blockquote>
          <p>{{ oneLineText(comment.body) }}</p>
        </div>
        <div class="plan-review-footer__comment-actions">
          <button
            class="plan-review-footer__comment-button"
            type="button"
            :aria-label="t('chat.planReview.editComment')"
            @click="emit('editComment', comment)"
          >
            <PencilIcon aria-hidden="true" />
          </button>
          <button
            class="plan-review-footer__comment-button"
            type="button"
            :aria-label="t('chat.planReview.deleteComment')"
            @click="emit('deleteComment', comment.id)"
          >
            <Trash2Icon aria-hidden="true" />
          </button>
        </div>
      </article>
    </div>

    <div class="plan-review-footer__actions">
      <button
        class="plan-review-footer__button plan-review-footer__button--primary"
        type="button"
        @click="emit('confirm')"
      >
        {{ t('chat.planReview.confirm') }}
      </button>
      <button
        class="plan-review-footer__button"
        type="button"
        @click="emit('comment')"
      >
        {{ t('chat.planReview.comment') }}
      </button>
      <button
        class="plan-review-footer__button"
        type="button"
        @click="emit('cancel')"
      >
        {{ t('chat.planReview.cancel') }}
      </button>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { PencilIcon, Trash2Icon } from '../shared/icons/app-icons';
import type { PlanReviewComment } from './side-panel';

defineProps<{
  comments: PlanReviewComment[];
  showCommentHelp?: boolean;
}>();

const emit = defineEmits<{
  confirm: [];
  comment: [];
  deleteComment: [commentId: string];
  editComment: [comment: PlanReviewComment];
  cancel: [];
}>();

const { t } = useI18n();

function oneLineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function commentTitle(comment: PlanReviewComment): string {
  return `${oneLineText(comment.quote)} - ${oneLineText(comment.body)}`;
}
</script>

<style scoped>
.plan-review-footer {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-8);
  border-top: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface-lowest) 94%, transparent);
  backdrop-filter: blur(10px);
}

.plan-review-footer__status {
  min-height: var(--line-height-18);
}

.plan-review-footer__help,
.plan-review-footer__count {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
}

.plan-review-footer__comments {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-height: 132px;
  overflow: auto;
  scrollbar-width: thin;
}

.plan-review-footer__comment {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-low);
}

.plan-review-footer__comment-copy {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
  white-space: nowrap;
}

.plan-review-footer__comment blockquote,
.plan-review-footer__comment p {
  margin: 0;
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
}

.plan-review-footer__comment blockquote {
  flex: 0 1 38%;
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-review-footer__comment blockquote::after {
  content: ":";
}

.plan-review-footer__comment p {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-review-footer__comment-actions {
  display: flex;
  gap: var(--space-2);
}

.plan-review-footer__comment-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--space-8);
  height: var(--space-8);
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.plan-review-footer__comment-button:hover {
  color: var(--color-text);
  background: var(--color-surface);
}

.plan-review-footer__comment-button svg {
  width: 14px;
  height: 14px;
}

.plan-review-footer__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

.plan-review-footer__button {
  height: var(--space-16);
  padding: 0 var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.plan-review-footer__button:hover {
  background: var(--color-surface-low);
}

.plan-review-footer__button--primary {
  border-color: var(--color-primary);
  color: var(--color-on-primary);
  background: var(--color-primary);
}

.plan-review-footer__button--primary:hover {
  background: var(--color-on-primary-container);
}
</style>
