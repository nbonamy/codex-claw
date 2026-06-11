<template>
  <div class="loop-execution-log__status-cell">
    <span
      class="loop-execution-log__status"
      :data-status="status"
    >
      {{ statusLabel }}
    </span>
    <div class="loop-execution-log__row-actions">
      <button
        type="button"
        :aria-label="`View conversation for ${ticket}`"
        @click.stop="emit('view-conversation')"
      >
        <EyeIcon aria-hidden="true" />
      </button>
      <button
        type="button"
        :aria-label="`Delete execution for ${ticket}`"
        @click.stop="emit('delete-execution')"
      >
        <Trash2Icon aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LoopExecutionStatus } from '../../shared/contracts';
import { EyeIcon, Trash2Icon } from '../shared/icons/app-icons';

defineProps<{
  status: LoopExecutionStatus;
  statusLabel: string;
  ticket: string;
}>();

const emit = defineEmits<{
  'delete-execution': [];
  'view-conversation': [];
}>();
</script>

<style scoped>
.loop-execution-log__status {
  display: block;
  color: var(--color-success);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-18);
  white-space: nowrap;
}

.loop-execution-log__status-cell {
  height: 18px;
  min-width: 68px;
  display: flex;
  align-items: center;
  justify-items: end;
}

.loop-execution-log__status[data-status="working"] {
  color: var(--color-warning);
}

.loop-execution-log__status[data-status="failed"] {
  color: var(--color-error);
}

.loop-execution-log__row-actions {
  display: none;
  align-items: center;
  gap: var(--space-2);
}

.loop-execution-log__status-cell:hover .loop-execution-log__status,
.loop-execution-log__status-cell:focus-within .loop-execution-log__status {
  display: none;
}

.loop-execution-log__status-cell:hover .loop-execution-log__row-actions,
.loop-execution-log__status-cell:focus-within .loop-execution-log__row-actions {
  display: flex;
}

.loop-execution-log__row-actions button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.loop-execution-log__row-actions button:hover,
.loop-execution-log__row-actions button:focus-visible {
  color: var(--color-text);
}

.loop-execution-log__row-actions svg {
  width: var(--icon-md);
  height: var(--icon-md);
}
</style>
