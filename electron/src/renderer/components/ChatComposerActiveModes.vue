<template>
  <div
    v-if="planMode"
    class="chat-composer__modes"
    aria-label="Active composer modes"
  >
    <span class="chat-composer__mode chat-composer__mode__info">
      <ListDetailsIcon class="chat-composer__mode__icon" />
      <CircleXIcon
        class="chat-composer__mode__remove"
        aria-label="Disable plan mode"
        role="button"
        @click="emit('disablePlanMode')"
      />
      Plan
    </span>
  </div>
</template>

<script setup lang="ts">
import { CircleXIcon, ListDetailsIcon } from '../shared/icons/app-icons'

defineProps<{
  planMode: boolean
}>()

const emit = defineEmits<{
  disablePlanMode: []
}>()
</script>

<style scoped>
.chat-composer__modes {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.chat-composer__mode {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 24px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-full);
  background: var(--color-surface-base);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.chat-composer__mode svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.chat-composer__mode .chat-composer__mode__remove {
  display: none;
}

.chat-composer__mode:hover .chat-composer__mode__icon {
  display: none;
}

.chat-composer__mode:hover .chat-composer__mode__remove {
  cursor: pointer;
  display: inline;
}

.chat-composer__mode.chat-composer__mode__info {
  background-color: var(--color-secondary-container);
  color: var(--color-on-secondary-container);
}
</style>
