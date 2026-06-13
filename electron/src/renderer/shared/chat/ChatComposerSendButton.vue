<template>
  <button
    class="chat-composer__send"
    :class="{ 'chat-composer__send--loading': loading }"
    type="button"
    :disabled="disabled"
    :aria-label="loading ? cancelLabel : (label ?? 'Send')"
    @click="emit('click')"
  >
    <svg
      v-if="!loading"
      class="chat-composer__send-icon chat-composer__send-icon--send"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="currentColor" />
    </svg>
    <svg
      v-else
      class="chat-composer__send-icon chat-composer__spinner"
      width="16"
      height="16"
      viewBox="0 0 16 16"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        stroke-width="2"
        fill="none"
        stroke-dasharray="28"
        stroke-dashoffset="10"
      />
    </svg>
    <svg
      v-if="loading"
      class="chat-composer__send-icon chat-composer__stop"
      width="16"
      height="16"
      viewBox="0 0 16 16"
    >
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  cancelLabel?: string;
  disabled?: boolean;
  label?: string;
  loading?: boolean;
}>(), {
  cancelLabel: 'Cancel',
  disabled: false,
  label: undefined,
  loading: false,
});

const emit = defineEmits<{
  click: [];
}>();
</script>

<style scoped>
.chat-composer__send {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-on-surface-variant);
  color: var(--color-surface);
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease, transform 0.1s ease;
}

.chat-composer__send-icon {
  position: absolute;
}

.chat-composer__send:hover:not(:disabled) {
  background: var(--color-on-surface);
}

.chat-composer__send:active:not(:disabled) {
  transform: scale(0.94);
}

.chat-composer__send:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.chat-composer__spinner {
  animation: spin 0.8s linear infinite;
}

.chat-composer__stop {
  opacity: 0;
}

.chat-composer__send--loading:hover .chat-composer__spinner {
  opacity: 0;
}

.chat-composer__send--loading:hover .chat-composer__stop {
  opacity: 1;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
