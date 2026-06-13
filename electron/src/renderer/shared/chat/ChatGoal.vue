<template>
  <div v-if="goal" class="chat-goal" aria-label="Current goal">
    <TargetArrowIcon class="chat-goal__icon" aria-hidden="true" />
    <div class="chat-goal__copy">
      <span class="chat-goal__label">Goal</span>
      <span class="chat-goal__objective">{{ goal.objective }}</span>
    </div>
    <div class="chat-goal__actions">
      <button
        class="chat-goal__action"
        type="button"
        aria-label="Edit goal"
        title="Edit goal"
        @click="emit('edit')"
      >
        <PencilIcon aria-hidden="true" />
        <span>Edit</span>
      </button>
      <button
        class="chat-goal__action"
        type="button"
        aria-label="Clear goal"
        title="Clear goal"
        @click="emit('clear')"
      >
        <Trash2Icon aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ThreadGoal } from '@codex-claw/shared/contracts';
import { PencilIcon, TargetArrowIcon, Trash2Icon } from '../icons/app-icons';

defineProps<{
  goal: ThreadGoal | null;
}>();

const emit = defineEmits<{
  clear: [];
  edit: [];
}>();
</script>

<style scoped>
.chat-goal {
  width: 100%;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
  border: 0.5px solid var(--color-border);
  border-bottom: 0;
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-sm);
  color: var(--color-text-muted);
}

.chat-goal__icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.chat-goal__copy {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.chat-goal__label {
  color: var(--color-text);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
}

.chat-goal__objective {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-xlight);
  line-height: var(--line-height-18);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-goal__actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.chat-goal__action {
  width: auto;
  height: var(--space-12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  gap: var(--space-2);
  cursor: pointer;
}

.chat-goal__action:hover {
  background: var(--color-surface-low);
  color: var(--color-text);
}

.chat-goal__action svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}
</style>
