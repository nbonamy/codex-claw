<template>
  <div class="thread-flag-affordance" role="status">
    <GitBranchIcon
      v-if="id === 'delegate_to_worktree'"
      class="thread-flag-affordance__icon"
      aria-hidden="true"
    />
    <IconChecklist
      v-else
      class="thread-flag-affordance__icon"
      aria-hidden="true"
    />
    <span class="thread-flag-affordance__prompt">{{ t(copyKey('prompt')) }}</span>
    <div class="thread-flag-affordance__actions">
      <button
        class="thread-flag-affordance__action"
        type="button"
        :aria-label="t(copyKey('accept'))"
        :title="t(copyKey('accept'))"
        :disabled="busy"
        @click="emit('execute')"
      ><CheckIcon aria-hidden="true" /></button>
      <button
        class="thread-flag-affordance__dismiss"
        type="button"
        :aria-label="t(copyKey('dismiss'))"
        :title="t(copyKey('dismiss'))"
        :disabled="busy"
        @click="emit('dismiss')"
      ><X aria-hidden="true" /></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ThreadFlagId } from '@codex-claw/core/thread-flags';
import { IconChecklist } from '@tabler/icons-vue';
import { CheckIcon, GitBranchIcon, X } from '../shared/icons/app-icons';

const props = defineProps<{ id: ThreadFlagId; busy?: boolean }>();
const emit = defineEmits<{ execute: []; dismiss: [] }>();
const { t } = useI18n();

function copyKey(kind: 'prompt' | 'accept' | 'dismiss'): string {
  const flag = props.id === 'ready_for_review' ? 'readyForReview' : 'delegateToWorktree';
  return `chat.threadFlags.${flag}.${kind}`;
}
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
  display: block;
  flex: 0 0 auto;
}

.thread-flag-affordance__prompt {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-14);
  line-height: var(--line-height-18);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-flag-affordance__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-2);
}

.thread-flag-affordance__action,
.thread-flag-affordance__dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
  cursor: pointer;
}

.thread-flag-affordance__action {
  width: var(--space-12);
  height: var(--space-12);
  padding: 0;
  color: var(--color-text-muted);
}

.thread-flag-affordance__dismiss {
  width: var(--space-12);
  height: var(--space-12);
  padding: 0;
  color: var(--color-text-muted);
}

.thread-flag-affordance__action svg,
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
