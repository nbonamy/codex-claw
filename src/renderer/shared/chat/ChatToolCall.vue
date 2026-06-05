<template>
  <section class="chat-tool-call" :class="{ 'chat-tool-call--open': isOpen, [`chat-tool-call--${toolCall.state}`]: true }">
    <div v-if="summaryOnly" class="chat-tool-call__summary">
      <ChatToolCallTitle :line-diff="lineDiff" :running="isRunning" :title="title" />
      <component :is="isOpen ? ChevronUp : ChevronDown" class="chat-tool-group__chevron" :size="15" />
    </div>

    <button v-else-if="!headerless" class="chat-tool-call__header" type="button" @click="toggleOpen">
      <ChatToolCallTitle :line-diff="lineDiff" :running="isRunning" :title="title" />
      <component :is="isOpen ? ChevronUp : ChevronDown" class="chat-tool-call__chevron" :size="15" />
    </button>

    <div v-if="headerless" class="chat-tool-call__body">
      <div v-if="hasParams" class="chat-tool-call__section">
        <div class="chat-tool-call__section-title">Input</div>
        <pre class="chat-tool-call__json">{{ formatValue(toolCallArgs) }}</pre>
      </div>

      <div v-if="hasResult" class="chat-tool-call__section">
        <div class="chat-tool-call__section-title">Result</div>
        <pre class="chat-tool-call__json">{{ formatValue(toolCall.result) }}</pre>
      </div>
    </div>

    <ChatFoldTransition v-else :open="isOpen">
      <div class="chat-tool-call__body">
        <div v-if="hasParams" class="chat-tool-call__section">
          <div class="chat-tool-call__section-title">Input</div>
          <pre class="chat-tool-call__json">{{ formatValue(toolCallArgs) }}</pre>
        </div>

        <div v-if="hasResult" class="chat-tool-call__section">
          <div class="chat-tool-call__section-title">Result</div>
          <pre class="chat-tool-call__json">{{ formatValue(toolCall.result) }}</pre>
        </div>
      </div>
    </ChatFoldTransition>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronUp } from '../icons/app-icons'
import ChatFoldTransition from './ChatFoldTransition.vue'
import ChatToolCallTitle from './ChatToolCallTitle.vue'
import { getToolFallbackTitle, getToolLineDiff, parseToolStatusDescriptor } from './tool-status'
import { getMessageToolCallArgs, getMessageToolCallName, type MessageToolCall } from './types'

const props = defineProps<{
  answeredClientRequestIds?: Set<string>
  headerless?: boolean
  summaryOnly?: boolean
  toolCall: MessageToolCall
}>()
const emit = defineEmits<{
  cancel: []
  'client-response': [response: { id: string; payload: unknown }]
}>()

const isOpen = ref(false)

const toolCallName = computed(() => getMessageToolCallName(props.toolCall))
const toolCallArgs = computed(() => getMessageToolCallArgs(props.toolCall))
const isRunning = computed(() => !props.toolCall.done && props.toolCall.state !== 'completed')
const statusDescriptor = computed(() => parseToolStatusDescriptor(props.toolCall.status))
const fallbackTitle = computed(() => getToolFallbackTitle(props.toolCall))
const title = computed(() => {
  const descriptor = statusDescriptor.value
  if (descriptor) {
    return `${descriptor.phase} ${toolCallName.value}`
  }
  if (props.toolCall.status && !['running', 'completed', 'failed'].includes(props.toolCall.status)) {
    return props.toolCall.status
  }
  return fallbackTitle.value
})
const lineDiff = computed(() => getToolLineDiff(statusDescriptor.value))
const hasParams = computed(() => toolCallArgs.value !== undefined)
const hasResult = computed(() => props.toolCall.result !== undefined)

function toggleOpen() {
  isOpen.value = !isOpen.value
}

function formatValue(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  return JSON.stringify(value, null, 2)
}
</script>

<style scoped>
.chat-tool-call {
  width: 100%;
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-muted);
}

.chat-tool-call--canceled,
.chat-tool-call--error {
  opacity: 0.72;
}

.chat-tool-call__header,
.chat-tool-call__summary {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-width: 0;
  color: inherit;
  font: inherit;
  text-align: left;
}

.chat-tool-call__header {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.chat-tool-call__chevron {
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.chat-tool-call__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-4) 0 var(--space-4) 0;
}

.chat-tool-call__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.chat-tool-call__section-title {
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
}

.chat-tool-call__json {
  max-height: 240px;
  overflow: auto;
  margin: 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-low);
  color: var(--color-text);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-12);
  line-height: var(--line-height-20);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

</style>
