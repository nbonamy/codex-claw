<template>
  <div v-if="prompts.length" class="chat-queued-prompts">
    <ChatQueuedPrompt
      v-for="prompt in prompts"
      :key="prompt.id"
      :prompt="prompt"
      @delete="$emit('delete', $event)"
      @steer="$emit('steer', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import ChatQueuedPrompt from './ChatQueuedPrompt.vue';
import type { QueuedChatPrompt } from './queued-prompts';

defineProps<{
  prompts: QueuedChatPrompt[];
}>();

defineEmits<{
  delete: [id: string];
  steer: [id: string];
}>();
</script>

<style scoped>
.chat-queued-prompts {
  width: 100%;
  display: flex;
  flex-direction: column;
  border: 0.5px solid var(--color-border);
  border-bottom: 0;
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-sm);
}
</style>
