<template>
  <div v-if="message.type === 'compaction'" class="chat-message chat-message--compaction">
    <div class="chat-message__compaction-line" />
    <span class="chat-message__compaction-title">Automatically compacting context</span>
  </div>
  <div
    v-else
    class="chat-message"
    :class="`chat-message--${message.role}`"
  >
    <div class="chat-message__body">
      <div class="chat-message__stack">
        <ChatMessageBlock
          v-for="(block, blockIndex) in blocks"
          :key="block.type === 'tool' ? block.toolCall.id : `${block.type}-${blockIndex}`"
          :answered-client-request-ids="answeredClientRequestIds"
          :block="block"
          :follow-ups-disabled="followUpsDisabled"
          @cancel="emit('cancel')"
          @client-response="emit('client-response', $event)"
          @send-follow-up="emit('send-follow-up', $event)"
        />
        <span
          v-if="showThinkingIndicator"
          class="chat-message__thinking text-shimmer"
          data-label="Thinking"
        >
          Thinking
        </span>
        <span
          v-else-if="showStreamingDot"
          class="chat-message__stream-dot"
          aria-label="Streaming"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ClientRequestResponse } from '../../../shared/contracts'
import type { Message } from './types'
import type { MessageBlock } from './message-blocks'
import ChatMessageBlock from './ChatMessageBlock.vue'
import { computeMessageBlocks } from './message-blocks'

const props = withDefaults(defineProps<{
  actionsDisabled?: boolean
  answeredClientRequestIds?: Set<string>
  followUpsDisabled?: boolean
  index?: number
  message: Message
}>(), {
  index: 0,
})
const emit = defineEmits<{
  cancel: []
  'client-response': [response: ClientRequestResponse]
  'copy-message': [index: number]
  'delete-message': [index: number]
  'edit-message': [payload: { content: string; index: number }]
  'quote-message': [index: number]
  'review-file': [path: string]
  'retry-message': [index: number]
  'send-follow-up': [prompt: string]
  'undo-change-set': [changeSetId: string]
}>()

const blocks = computed(() => computeMessageBlocks(props.message))
const hasVisibleAssistantActivity = computed(() => blocks.value.some(isVisibleAssistantBlock))
const showThinkingIndicator = computed(() => (
  props.message.role === 'assistant' &&
  props.message.streaming === true &&
  !hasVisibleAssistantActivity.value
))
const showStreamingDot = computed(() => (
  props.message.role === 'assistant' &&
  props.message.streaming === true &&
  hasVisibleAssistantActivity.value
))

function isVisibleAssistantBlock(block: MessageBlock) {
  if (block.type === 'text') {
    return block.content.trim().length > 0
  }

  return block.type === 'media' || block.type === 'tool' || block.type === 'tool-group'
}
</script>

<style scoped>
.chat-message {
  display: flex;
}

.chat-message--user {
  justify-content: flex-end;
}

.chat-message--assistant {
  justify-content: flex-start;
}

.chat-message--compaction {
  position: relative;
  align-items: center;
  justify-content: center;
  min-height: 28px;
}

.chat-message__compaction-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px solid var(--color-border);
}

.chat-message__compaction-title {
  z-index: 1;
  padding: 0 var(--space-6);
  background: var(--color-surface-lowest);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
}

.chat-message__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 100%;
}

.chat-message--user .chat-message__body {
  align-items: flex-end;
  max-width: 70%;
}

.chat-message--assistant .chat-message__body {
  align-items: flex-start;
}

.chat-message__stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 100%;
}

.chat-message--assistant .chat-message__stack {
  width: 100%;
}

.chat-message--user .chat-message__stack {
  background: var(--color-surface-base);
  border-radius: var(--radius-xl);
  border-bottom-right-radius: var(--radius-xs);
}

.chat-message__thinking {
  align-self: flex-start;
  overflow: hidden;
  padding: var(--space-3) 0;
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-light);
  line-height: var(--line-height-20);
}

.chat-message__stream-dot {
  display: block;
  width: var(--space-4);
  height: var(--space-4);
  align-self: flex-start;
  margin-top: var(--space-1);
  border-radius: 999px;
  background: var(--color-text-muted);
  transform-origin: 50% 50%;
  animation: chat-message-stream-dot 1.15s ease-in-out infinite;
}

@keyframes chat-message-stream-dot {
  0%,
  100% {
    border-radius: 999px;
    opacity: 0.48;
    transform: rotate(0deg) scale(0.72);
  }

  50% {
    border-radius: var(--radius-xs);
    opacity: 1;
    transform: rotate(180deg) scale(1);
  }

  75% {
    border-radius: var(--radius-sm);
    transform: rotate(270deg) scale(0.86);
  }
}
</style>
