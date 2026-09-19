<template>
  <div class="thread-flag-affordance" role="status">
    <span>{{ t('chat.threadFlags.delegateToWorktree') }}</span>
    <button
      class="thread-flag-affordance__action"
      type="button"
      :disabled="busy"
      @click="emit('execute')"
    >{{ t('chat.threadFlags.delegate') }}</button>
    <button
      class="thread-flag-affordance__dismiss"
      type="button"
      :aria-label="t('chat.threadFlags.dismiss')"
      :disabled="busy"
      @click="emit('dismiss')"
    >×</button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{ busy?: boolean }>();
const emit = defineEmits<{ execute: []; dismiss: [] }>();
const { t } = useI18n();
</script>

<style scoped>
.thread-flag-affordance {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 30px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  font-size: var(--font-size-13);
}

.thread-flag-affordance__action,
.thread-flag-affordance__dismiss {
  border: 0;
  color: var(--color-text);
  background: transparent;
  cursor: pointer;
}

.thread-flag-affordance__action {
  margin-left: auto;
  color: var(--color-primary);
  font-weight: 600;
}

.thread-flag-affordance__dismiss {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 18px;
  line-height: 1;
}

.thread-flag-affordance button:hover:not(:disabled) {
  background: var(--color-surface-high);
}

.thread-flag-affordance button:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
