<template>
  <div class="thread-flag-affordance" role="status">
    <GitBranchIcon class="thread-flag-affordance__icon" aria-hidden="true" />
    <div class="thread-flag-affordance__copy">
      <span class="thread-flag-affordance__label">{{ t('chat.threadFlags.label') }}</span>
      <span class="thread-flag-affordance__description">{{ t('chat.threadFlags.delegateToWorktree') }}</span>
    </div>
    <div class="thread-flag-affordance__actions">
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
      ><X aria-hidden="true" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { GitBranchIcon, X } from '../shared/icons/app-icons';

defineProps<{ busy?: boolean }>();
const emit = defineEmits<{ execute: []; dismiss: [] }>();
const { t } = useI18n();
</script>

<style scoped>
.thread-flag-affordance {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  color: var(--color-text-muted);
}

.thread-flag-affordance__icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
}

.thread-flag-affordance__copy {
  min-width: 0;
  display: flex;
  flex: 1;
  align-items: baseline;
  gap: var(--space-3);
}

.thread-flag-affordance__label {
  color: var(--color-text);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
}

.thread-flag-affordance__description {
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-xlight);
  line-height: var(--line-height-18);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-flag-affordance__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.thread-flag-affordance__action,
.thread-flag-affordance__dismiss {
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  font-size: var(--font-size-12);
  cursor: pointer;
}

.thread-flag-affordance__action {
  width: auto;
  height: var(--space-12);
  padding: 0 var(--space-3);
  color: var(--color-text-muted);
}

.thread-flag-affordance__dismiss {
  width: var(--space-12);
  height: var(--space-12);
  padding: 0;
  color: var(--color-text-muted);
}

.thread-flag-affordance__dismiss svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.thread-flag-affordance button:hover:not(:disabled) {
  background: var(--color-surface-high);
}

.thread-flag-affordance button:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>
