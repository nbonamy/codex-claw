<template>
  <div v-if="prompts.length" class="chat-queued-prompts">
    <div
      v-for="prompt in prompts"
      :key="prompt.id"
      class="chat-queued-prompt"
      aria-label="Queued prompt"
    >
      <TerminalIcon class="chat-queued-prompt__icon" aria-hidden="true" />
      <span class="chat-queued-prompt__text">{{ prompt.text }}</span>
      <button
        class="chat-queued-prompt__delete"
        type="button"
        aria-label="Delete queued prompt"
        @click="emit('delete', prompt.id)"
      >
        <Trash2Icon aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { TerminalIcon, Trash2Icon } from '../icons/app-icons'

export type QueuedChatPrompt = {
  id: string;
  text: string;
}

defineProps<{
  prompts: QueuedChatPrompt[]
}>()

const emit = defineEmits<{
  delete: [id: string]
}>()

</script>

<style scoped>

.chat-queued-prompts {
  width: 90%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  border: 0.5px solid var(--color-border);
  border-bottom: 0;
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-sm);
}

.chat-queued-prompt {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr) max-content;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
  border-bottom: 0.5px solid var(--color-border);
  color: var(--color-text-muted);
}

.chat-queued-prompt:last-of-type {
  border-bottom: none;
}

.chat-queued-prompt__icon {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.chat-queued-prompt__text {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-xlight);
  line-height: var(--line-height-18);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-queued-prompt__delete {
  width: var(--space-12);
  height: var(--space-12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.chat-queued-prompt__delete:hover {
  background: var(--color-surface-low);
  color: var(--color-text);
}

.chat-queued-prompt__delete svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}
</style>
