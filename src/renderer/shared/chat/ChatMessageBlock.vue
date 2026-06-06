<template>
  <div
    v-if="block.type === 'user-text'"
    class="chat-message-block chat-message-block--text"
    v-html="renderUserText(block.content)"
  />
  <div
    v-else-if="block.type === 'text'"
    class="chat-message-block chat-message-block--text"
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
  font-size: calc(var(--font-size-15) + .5px);
  opacity: 0.85;
}

.chat-message--user .chat-message-block--text {
  padding: var(--space-3) var(--space-6);
}

.chat-message-block--text :deep(> *:first-child) {
  margin-top: 0;
}

.chat-message-block--text :deep(> *:last-child) {
  margin-bottom: 0;
}

.chat-message-block--text :deep(p),
.chat-message-block--text :deep(ul),
.chat-message-block--text :deep(ol),
.chat-message-block--text :deep(blockquote),
.chat-message-block--text :deep(pre),
.chat-message-block--text :deep(table) {
  margin: 0 0 var(--space-6);
}

.chat-message-block--text :deep(h1),
.chat-message-block--text :deep(h2),
.chat-message-block--text :deep(h3),
.chat-message-block--text :deep(h4),
.chat-message-block--text :deep(h5),
.chat-message-block--text :deep(h6) {
  margin: var(--space-8) 0 var(--space-4);
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.chat-message-block--text :deep(h1) {
  font-size: var(--font-size-20);
  line-height: var(--line-height-28);
}

.chat-message-block--text :deep(h2) {
  font-size: var(--font-size-18);
}

.chat-message-block--text :deep(h3),
.chat-message-block--text :deep(h4) {
  font-size: var(--font-size-16);
}

.chat-message-block--text :deep(h5),
.chat-message-block--text :deep(h6) {
  font-size: var(--font-size-15);
}

.chat-message-block--text :deep(ul),
.chat-message-block--text :deep(ol) {
  padding-left: var(--space-12);
}

.chat-message-block--text :deep(strong) {
  font-weight: var(--font-weight-medium);
}

.chat-message-block--text :deep(code) {
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  background: var(--color-surface-low);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-14);
}

.chat-message-block--text :deep(pre) {
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-8);
  background: var(--color-surface-low);
}

.chat-message-block--text :deep(pre code) {
  padding: 0;
  background: transparent;
  color: inherit;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
}

.chat-message-block--text :deep(blockquote) {
  border-left: 3px solid var(--color-border-strong);
  padding-left: var(--space-8);
  color: var(--color-text-muted);
}

.chat-message-block--text :deep(a) {
  color: var(--color-secondary);
  line-height: inherit;
  text-decoration: none;
  vertical-align: baseline;
}

.chat-message-block--text :deep(a:hover) {
  color: var(--color-secondary);
}

.chat-message-block--text :deep(.chat-message-link__icon) {
  display: inline-block;
  width: var(--icon-sm);
  height: var(--icon-sm);
  margin-left: var(--space-1);
  margin-right: var(--space-2);
  vertical-align: -0.12em;
}

.chat-message-block--text :deep(.chat-message-link__icon--favicon) {
  background-image: var(--favicon-url, none);
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  margin-left: var(--space-2);
  margin-right: var(--space-3);
}

.chat-message-block--text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-14);
}

.chat-message-block--text :deep(th),
.chat-message-block--text :deep(td) {
  border: 1px solid var(--color-border);
  padding: var(--space-3) var(--space-4);
  text-align: left;
  vertical-align: top;
}

.chat-message-block--text :deep(th) {
  background: var(--color-surface-low);
  font-weight: var(--font-weight-semibold);
}
</style>
