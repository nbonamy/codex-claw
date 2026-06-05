<template>
  <div class="chat-follow-ups">
    <button
      v-for="prompt in prompts"
      :key="prompt"
      class="chat-follow-ups__chip"
      :disabled="disabled"
      type="button"
      @click="emit('send-follow-up', prompt)"
    >
      {{ prompt }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  disabled?: boolean
  prompts: string[]
}>()

const emit = defineEmits<{
  'send-follow-up': [prompt: string]
}>()
</script>

<style scoped>
.chat-follow-ups {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin: var(--space-4) 0;
}

.chat-follow-ups__chip {
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-6);
  background: var(--color-surface-lowest);
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: var(--font-family-base);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-follow-ups__chip:hover:not(:disabled) {
  background: var(--color-text-muted);
  color: var(--color-surface-lowest);
}

.chat-follow-ups__chip:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
