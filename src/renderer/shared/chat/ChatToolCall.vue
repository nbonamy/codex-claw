<template>
  <ChatToolConfirmation
    v-if="isToolConfirmation"
    :answered-client-request-ids="answeredClientRequestIds"
    :tool-call="toolCall"
    @client-response="emit('client-response', $event)"
  />
  <section v-else class="chat-tool-call" :class="{ 'chat-tool-call--open': isOpen, [`chat-tool-call--${toolCall.state}`]: true }">
    <div v-if="summaryOnly" class="chat-tool-call__summary">
      <ChatToolCallTitle
        :icon="titleIcon"
        :line-diff="lineDiff"
        :running="isRunning"
        :title="titleParts.title"
        :title-prefix="titleParts.prefix"
        :title-target="titleParts.target"
      />
      <component :is="isOpen ? ChevronUp : ChevronDown" class="chat-tool-group__chevron" :size="15" />
    </div>

    <button v-else-if="!headerless" class="chat-tool-call__header" type="button" @click="toggleOpen">
      <ChatToolCallTitle
        :icon="titleIcon"
        :line-diff="lineDiff"
        :running="isRunning"
        :title="titleParts.title"
        :title-prefix="titleParts.prefix"
        :title-target="titleParts.target"
      />
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
import { useI18n } from 'vue-i18n'
import { ChevronDown, ChevronUp, PencilIcon } from '../icons/app-icons'
import type { ClientRequestResponse } from '../../../shared/contracts'
import ChatFoldTransition from './ChatFoldTransition.vue'
import ChatToolConfirmation from './ChatToolConfirmation.vue'
import ChatToolCallTitle from './ChatToolCallTitle.vue'
import { getToolDisplayTitleParts, getToolLineDiff, parseToolStatusDescriptor } from './tool-status'
import { getMessageToolCallArgs, type MessageToolCall } from './types'

const props = defineProps<{
  answeredClientRequestIds?: Set<string>
  headerless?: boolean
  summaryOnly?: boolean
  toolCall: MessageToolCall
}>()
const emit = defineEmits<{
  cancel: []
  'client-response': [response: ClientRequestResponse]
}>()

const { t } = useI18n()
const isOpen = ref(false)

const toolCallArgs = computed(() => getMessageToolCallArgs(props.toolCall))
const isRunning = computed(() => !props.toolCall.done && props.toolCall.state !== 'completed')
const statusDescriptor = computed(() => parseToolStatusDescriptor(props.toolCall.status))
const confirmationParams = computed(() => (
  statusDescriptor.value?.params && typeof statusDescriptor.value.params === 'object'
    ? statusDescriptor.value.params
    : {}
))
const isToolConfirmation = computed(() => (
  (statusDescriptor.value?.source === 'mcp' || statusDescriptor.value?.source === 'home') &&
  typeof confirmationParams.value.requestId === 'string' &&
  props.toolCall.state === 'running'
))
const titleParts = computed(() => {
  const descriptor = statusDescriptor.value
  if (props.toolCall.status && !['running', 'completed', 'failed'].includes(props.toolCall.status)) {
    return descriptor ? getToolDisplayTitleParts(props.toolCall, descriptor, t) : { title: props.toolCall.status }
  }
  return getToolDisplayTitleParts(props.toolCall, descriptor, t)
})
const titleIcon = computed(() => statusDescriptor.value?.source === 'codex' && statusDescriptor.value.action === 'edit' ? PencilIcon : undefined)
const lineDiff = computed(() => getToolLineDiff(statusDescriptor.value))
const hasParams = computed(() => toolCallArgs.value !== undefined)
const hasResult = computed(() => props.toolCall.result !== undefined && props.toolCall.result !== null)

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
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}

.chat-tool-call__header:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: var(--space-1);
}

.chat-tool-call__chevron,
.chat-tool-group__chevron {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
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
