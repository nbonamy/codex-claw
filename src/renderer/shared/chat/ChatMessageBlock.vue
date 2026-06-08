<template>
  <div
    v-if="block.type === 'user-text'"
    class="chat-message-block chat-message-block--text claw-markdown"
    v-html="renderUserText(block.content)"
  />
  <div
    v-else-if="block.type === 'text'"
    class="chat-message-block chat-message-block--text claw-markdown"
    v-html="renderMarkdown(block.content)"
  />
  <ChatMermaidBlock
    v-else-if="block.type === 'mermaid'"
    :code="block.code"
  />
  <ChatMediaBlock
    v-else-if="block.type === 'media'"
    :media="block.media"
  />
  <ChatToolCall
    v-else-if="block.type === 'tool'"
    :answered-client-request-ids="answeredClientRequestIds"
    :tool-call="block.toolCall"
    @cancel="emit('cancel')"
    @client-response="emit('client-response', $event)"
  />
  <ChatToolGroup
    v-else-if="block.type === 'tool-group'"
    :answered-client-request-ids="answeredClientRequestIds"
    :tool-calls="block.toolCalls"
    @cancel="emit('cancel')"
    @client-response="emit('client-response', $event)"
  />
  <ChatFollowUps
    v-else
    :disabled="followUpsDisabled"
    :prompts="block.prompts"
    @send-follow-up="emit('send-follow-up', $event)"
  />
</template>

<script setup lang="ts">
import ChatFollowUps from './ChatFollowUps.vue'
import ChatMediaBlock from './ChatMediaBlock.vue'
import ChatMermaidBlock from './ChatMermaidBlock.vue'
import ChatToolGroup from './ChatToolGroup.vue'
import ChatToolCall from './ChatToolCall.vue'
import { renderMarkdown, renderUserText } from './message-markdown'
import type { MessageBlock } from './message-blocks'
import type { ClientRequestResponse } from '../../../shared/contracts'

defineProps<{
  block: MessageBlock
  answeredClientRequestIds?: Set<string>
  followUpsDisabled?: boolean
}>()

const emit = defineEmits<{
  cancel: []
  'client-response': [response: ClientRequestResponse]
  'send-follow-up': [prompt: string]
}>()
</script>

<style scoped>

.chat-message-block--text {
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: var(--line-height-22);
  font-size: var(--chat-font-size, var(--font-size-15));
  opacity: 0.85;
}

.chat-message--user .chat-message-block--text {
  padding: var(--space-3) var(--space-6);
}
</style>
