<template>
  <form
    class="chat-composer"
    :class="{ 'chat-composer--disabled': disabled && !isSending }"
    aria-label="Prompt composer"
    @submit.prevent="submitPrompt"
  >
    <button
      class="chat-composer__tool"
      type="button"
      aria-label="Attach context"
      :disabled="disabled"
    >
      <Plus />
    </button>

    <textarea
      ref="textareaEl"
      v-model="prompt"
      class="chat-composer__input"
      :placeholder="placeholder"
      aria-label="Prompt"
      rows="1"
      :disabled="disabled && !isSending"
      @input="resizeTextarea"
      @keydown.enter.exact.prevent="submitPrompt"
      @keydown.shift.enter="resizeTextareaSoon"
    />

    <div class="chat-composer__meta">
      <button
        class="chat-composer__model"
        type="button"
        aria-label="Model"
        disabled
      >
        gpt-5.5 high
      </button>
      <button
        class="chat-composer__send"
        type="submit"
        :aria-label="isSending ? 'Codex is working' : 'Send prompt'"
        :disabled="!canSend"
      >
        <Loading v-if="isSending" class="chat-composer__spinner" />
        <Promotion v-else />
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Loading, Plus, Promotion } from '@element-plus/icons-vue';

const props = defineProps<{
  disabled: boolean;
  isSending: boolean;
  placeholder: string;
}>();

const emit = defineEmits<{
  send: [prompt: string];
}>();

const prompt = ref('');
const textareaEl = ref<HTMLTextAreaElement | null>(null);

const canSend = computed(() => Boolean(prompt.value.trim() && !props.disabled && !props.isSending));

function submitPrompt(): void {
  const trimmed = prompt.value.trim();
  if (!canSend.value) {
    return;
  }

  prompt.value = '';
  emit('send', trimmed);
  void nextTick(resizeTextarea);
}

function resizeTextarea(): void {
  const textarea = textareaEl.value;
  if (!textarea) {
    return;
  }

  textarea.style.height = '0px';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
}

function resizeTextareaSoon(): void {
  void nextTick(resizeTextarea);
}
</script>

<style scoped>
.chat-composer {
  display: flex;
  align-items: flex-end;
  gap: var(--cc-space-3);
  width: 100%;
  min-height: var(--cc-composer-floating-min-height);
  padding: var(--cc-space-3);
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-composer);
  background: var(--cc-composer-bg);
  box-shadow: var(--cc-shadow-composer);
  transition: border-color var(--cc-transition-fast), box-shadow var(--cc-transition-fast);
}

.chat-composer:focus-within {
  border-color: var(--cc-border-strong);
  box-shadow: var(--cc-shadow-composer-focus);
}

.chat-composer--disabled {
  opacity: 0.62;
}

.chat-composer__tool,
.chat-composer__send,
.chat-composer__model {
  border: 0;
  color: var(--cc-text-muted);
  background: transparent;
}

.chat-composer__tool,
.chat-composer__send {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: var(--cc-composer-button-size);
  height: var(--cc-composer-button-size);
  border-radius: var(--cc-radius-pill);
  cursor: pointer;
}

.chat-composer__tool:hover:not(:disabled),
.chat-composer__model:hover:not(:disabled) {
  color: var(--cc-text);
  background: var(--cc-control-hover-bg);
}

.chat-composer__tool:disabled,
.chat-composer__send:disabled,
.chat-composer__model:disabled {
  cursor: default;
}

.chat-composer__tool svg,
.chat-composer__send svg {
  width: var(--cc-icon-size);
  height: var(--cc-icon-size);
}

.chat-composer__input {
  flex: 1 1 auto;
  min-width: 0;
  max-height: var(--cc-composer-input-max-height);
  padding: var(--cc-space-2) 0;
  border: 0;
  outline: 0;
  resize: none;
  overflow-y: auto;
  color: var(--cc-text);
  background: transparent;
  font: var(--cc-font-body);
  line-height: var(--cc-line-height-comfortable);
}

.chat-composer__input::placeholder {
  color: var(--cc-text-placeholder);
}

.chat-composer__meta {
  display: flex;
  align-items: center;
  gap: var(--cc-space-2);
  flex: 0 0 auto;
}

.chat-composer__model {
  min-height: var(--cc-composer-button-size);
  padding: 0 var(--cc-space-2);
  border-radius: var(--cc-radius-pill);
  font: var(--cc-font-body-small);
}

.chat-composer__send {
  color: var(--cc-text-inverse);
  background: var(--cc-send-bg);
}

.chat-composer__send:hover:not(:disabled) {
  background: var(--cc-send-bg-hover);
}

.chat-composer__send:disabled {
  color: var(--cc-send-disabled-text);
  background: var(--cc-send-disabled-bg);
}

.chat-composer__spinner {
  animation: chat-composer-spin 900ms linear infinite;
}

@keyframes chat-composer-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .chat-composer {
    border-radius: var(--cc-radius-3);
  }

  .chat-composer__model {
    display: none;
  }
}
</style>
