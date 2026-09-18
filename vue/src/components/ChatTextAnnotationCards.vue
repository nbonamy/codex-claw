<template>
  <div class="chat-text-annotation-cards" :aria-label="t('chat.textAnnotations.contextLabel')">
    <article
      v-for="annotation in annotations"
      :key="annotation.id"
      class="chat-text-annotation-cards__card"
    >
      <span class="chat-text-annotation-cards__label">{{ t('chat.textAnnotations.annotation') }}</span>
      <button
        type="button"
        class="chat-text-annotation-cards__remove"
        :aria-label="t('chat.textAnnotations.remove')"
        :disabled="disabled"
        @click="emit('remove', annotation.id)"
      >
        <X aria-hidden="true" />
      </button>
    </article>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { X } from '../shared/icons/app-icons';
import type { ChatTextAnnotation } from './use-chat-text-annotations';

defineProps<{
  annotations: readonly ChatTextAnnotation[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  remove: [annotationId: string];
}>();

const { t } = useI18n();
</script>

<style scoped>
.chat-text-annotation-cards {
  display: flex;
  gap: var(--space-4);
  width: 100%;
  margin-top: var(--space-2);
  overflow-x: auto;
}

.chat-text-annotation-cards__card {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
}

.chat-text-annotation-cards__label {
  color: var(--color-text);
  font-size: var(--font-size-12);
}

.chat-text-annotation-cards__remove {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  margin-inline-start: var(--space-3);
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  place-items: center;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.chat-text-annotation-cards__remove:hover:not(:disabled) {
  background: var(--color-surface-low);
  color: var(--color-text);
}

.chat-text-annotation-cards__remove:disabled {
  cursor: default;
  opacity: 0.5;
}

.chat-text-annotation-cards__remove svg {
  width: 15px;
  height: 15px;
}
</style>
