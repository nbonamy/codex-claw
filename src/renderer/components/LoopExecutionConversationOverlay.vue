<template>
  <div
    class="loop-execution-conversation-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="loop-execution-conversation-title"
  >
    <div
      class="loop-execution-conversation-overlay__scrim"
      aria-hidden="true"
    />
    <div class="loop-execution-conversation-overlay__card">
      <header class="loop-execution-conversation-overlay__header">
        <div>
          <h4 id="loop-execution-conversation-title">
            {{ ticket }}
          </h4>
          <span>{{ agentName }}</span>
        </div>
        <button
          type="button"
          aria-label="Close conversation preview"
          @click="emit('close')"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div
        v-if="loading"
        class="loop-execution-conversation-overlay__empty"
      >
        Loading conversation...
      </div>
      <div
        v-else-if="error"
        class="loop-execution-conversation-overlay__empty"
      >
        {{ error }}
      </div>
      <MessageList
        v-else-if="chatMessages.length > 0"
        class="loop-execution-conversation-overlay__messages"
        actions-disabled
        :can-delete-message="false"
        :can-edit-message="false"
        :can-retry-message="false"
        follow-ups-disabled
        :messages="chatMessages"
      />
      <div
        v-else
        class="loop-execution-conversation-overlay__empty"
      >
        No messages for this execution.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RendererMessage } from '../../shared/contracts';
import MessageList from '../shared/chat/MessageList.vue';
import { rendererMessagesToChatMessages } from '../shared/chat/renderer-message-adapter';
import { X } from '../shared/icons/app-icons';

const props = defineProps<{
  agentName: string;
  error?: string | null;
  loading?: boolean;
  messages: RendererMessage[];
  ticket: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const chatMessages = computed(() => rendererMessagesToChatMessages(props.messages));
</script>

<style scoped>
.loop-execution-conversation-overlay {
  position: fixed;
  inset: var(--space-32);
  z-index: 20;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: var(--space-24);
  background: transparent;
}

.loop-execution-conversation-overlay__scrim {
  position: absolute;
  inset: 0;
  background: var(--color-overlay);
  backdrop-filter: blur(8px);
}

.loop-execution-conversation-overlay__card {
  position: relative;
  z-index: 1;
  width: min(960px, 100%);
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-2xl);
  background: var(--color-shell-main);
  box-shadow: var(--shadow-lg);
}

.loop-execution-conversation-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
  padding: var(--space-12) var(--space-16);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-shell-main);
}

.loop-execution-conversation-overlay__header div {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.loop-execution-conversation-overlay__header h4,
.loop-execution-conversation-overlay__header span {
  margin: 0;
}

.loop-execution-conversation-overlay__header h4 {
  color: var(--color-text);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.loop-execution-conversation-overlay__header span {
  display: block;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.loop-execution-conversation-overlay__header button {
  width: 32px;
  height: 32px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.loop-execution-conversation-overlay__header button:hover,
.loop-execution-conversation-overlay__header button:focus-visible {
  color: var(--color-text);
  background: var(--color-surface);
}

.loop-execution-conversation-overlay__header svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.loop-execution-conversation-overlay__messages {
  min-height: 0;
  background: var(--color-shell-main);
  --message-list-content-width: 780px;
}

.loop-execution-conversation-overlay__empty {
  flex: 1 1 auto;
  display: grid;
  place-items: center;
  padding: var(--space-32);
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
}
</style>
