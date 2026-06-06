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
      <PlusIcon />
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
      @keydown="handleTextareaKeydown"
    />

    <div class="chat-composer__meta">
      <ChatContextUsageIndicator :context-usage="contextUsage" />
      <ChatModelReasoningSelector
        :disabled="disabled || isSending"
        :models="models"
        :model-catalog-status="modelCatalogStatus"
        :model-id="selectedModelId"
        :reasoning-effort="selectedReasoningEffort"
        @update:model-id="$emit('update:modelId', $event)"
        @update:reasoning-effort="$emit('update:reasoningEffort', $event)"
      />
      <ChatComposerSendButton
        :disabled="!canSend"
        :loading="sendButtonLoading"
        :label="sendButtonLabel"
        cancel-label="Codex is working"
        @click="submitPrompt"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { AgentContextUsage, CodexModelOption, ReasoningEffort } from '../../shared/contracts';
import { PlusIcon } from '../shared/icons/app-icons';
import ChatComposerSendButton from '../shared/chat/ChatComposerSendButton.vue';
import ChatContextUsageIndicator from './ChatContextUsageIndicator.vue';
import ChatModelReasoningSelector from './ChatModelReasoningSelector.vue';

const props = defineProps<{
  contextUsage?: AgentContextUsage;
  disabled: boolean;
  isSending: boolean;
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  models?: CodexModelOption[];
  placeholder: string;
  selectedModelId?: string | null;
  selectedReasoningEffort?: ReasoningEffort | null;
}>();

const emit = defineEmits<{
  send: [prompt: string];
  steer: [prompt: string];
  'update:modelId': [modelId: string];
  'update:reasoningEffort': [reasoningEffort: ReasoningEffort];
}>();

const prompt = ref('');
const textareaEl = ref<HTMLTextAreaElement | null>(null);

const hasPrompt = computed(() => Boolean(prompt.value.trim()));
const canSend = computed(() => Boolean(hasPrompt.value && !props.disabled));
const sendButtonLoading = computed(() => props.isSending && !hasPrompt.value);
const sendButtonLabel = computed(() => (props.isSending ? 'Queue prompt' : 'Send prompt'));

function submitPrompt(): void {
  submitWithIntent('send');
}

function submitSteer(): void {
  submitWithIntent('steer');
}

function submitWithIntent(intent: 'send' | 'steer'): void {
  const trimmed = prompt.value.trim();
  if (!canSend.value) {
    return;
  }

  prompt.value = '';
  if (intent === 'send') {
    emit('send', trimmed);
  } else {
    emit('steer', trimmed);
  }
  void nextTick(resizeTextarea);
}

function handleTextareaKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') {
    return;
  }

  if (event.shiftKey) {
    resizeTextareaSoon();
    return;
  }

  event.preventDefault();
  if (event.metaKey && !event.ctrlKey && !event.altKey) {
    submitSteer();
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    submitPrompt();
  }
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
  --chat-composer-button-size: 36px;
  --chat-composer-input-max-height: 160px;
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  width: 100%;
  min-height: 60px;
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.chat-composer:focus-within {
  box-shadow: 0 0 var(--space-6) var(--space-2) var(--color-surface-low), var(--shadow-md);
}

.chat-composer--disabled {
  opacity: 0.62;
}

.chat-composer__tool {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: var(--chat-composer-button-size);
  height: var(--chat-composer-button-size);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.chat-composer__tool:hover:not(:disabled) {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.chat-composer__tool:disabled {
  cursor: default;
}

.chat-composer__tool svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

.chat-composer__input {
  flex: 1 1 auto;
  min-width: 0;
  max-height: var(--chat-composer-input-max-height);
  padding: var(--space-4) 0;
  border: 0;
  outline: 0;
  resize: none;
  overflow-y: auto;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  line-height: var(--line-height-24);
}

.chat-composer__input::placeholder {
  color: var(--color-text-muted);
}

.chat-composer__meta {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex: 0 0 auto;
}

@media (max-width: 720px) {
  .chat-composer {
    border-radius: var(--radius-2xl);
  }
}
</style>
