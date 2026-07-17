<template>
  <button
    class="chat-composer__voice"
    :class="{ 'chat-composer__voice--recording': recording }"
    type="button"
    :disabled="disabled"
    :aria-pressed="recording"
    :aria-label="label"
    :title="title"
    @click="emit('toggle')"
  >
    <MicrophoneIcon aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { MicrophoneIcon } from '../shared/icons/app-icons'

defineProps<{
  disabled: boolean
  label: string
  recording: boolean
  title: string
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<style scoped>
.chat-composer__voice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--chat-composer-button-size-small, 28px);
  height: var(--chat-composer-button-size-small, 28px);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.chat-composer__voice:hover:not(:disabled),
.chat-composer__voice--recording {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.chat-composer__voice:disabled {
  cursor: default;
  opacity: 0.42;
}

.chat-composer__voice svg {
  width: 20px;
  height: 20px;
  stroke-width: 1.8;
}
</style>
