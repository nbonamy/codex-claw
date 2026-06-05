<template>
  <section
    class="chat-tool-confirmation"
    :class="{ 'chat-tool-confirmation--resolved': resolved }"
  >
    <div v-if="resolved" class="chat-tool-confirmation__summary">
      <ChatToolCallTitle :title="resolvedTitle" />
    </div>

    <template v-else>
      <header class="chat-tool-confirmation__header">
        <span class="chat-tool-confirmation__tag">Approve tool call</span>
        <span class="chat-tool-confirmation__question">{{ summary }}</span>
      </header>

      <details v-if="argumentsPreview" class="chat-tool-confirmation__details">
        <summary class="chat-tool-confirmation__details-summary">
          Details
        </summary>
        <pre class="chat-tool-confirmation__details-body">{{ argumentsPreview }}</pre>
      </details>

      <footer class="chat-tool-confirmation__actions">
        <button
          class="chat-tool-confirmation__button chat-tool-confirmation__button--primary"
          type="button"
          @click="respond('allow')"
        >
          Allow
        </button>
        <button
          v-if="showConversationAction"
          class="chat-tool-confirmation__button"
          type="button"
          @click="respond('allow_conversation')"
        >
          Allow for session
        </button>
        <button
          v-if="showAlwaysAction"
          class="chat-tool-confirmation__button"
          type="button"
          @click="respond('always_allow')"
        >
          Always allow
        </button>
        <button
          class="chat-tool-confirmation__button"
          type="button"
          @click="respond('deny')"
        >
          Deny
        </button>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { ToolConfirmationDecision } from '../../../shared/contracts'
import { computed, ref } from 'vue'
import ChatToolCallTitle from './ChatToolCallTitle.vue'
import { parseToolStatusDescriptor } from './tool-status'
import { getMessageToolCallArgs, getMessageToolCallName, type MessageToolCall } from './types'

const props = defineProps<{
  answeredClientRequestIds?: Set<string>
  toolCall: MessageToolCall
}>()

const emit = defineEmits<{
  'client-response': [response: { id: string; payload: { decision: ToolConfirmationDecision } }]
}>()

const localDecision = ref<ToolConfirmationDecision | null>(null)

const descriptor = computed(() => parseToolStatusDescriptor(props.toolCall.status))
const descriptorParams = computed(() => (
  descriptor.value?.params && typeof descriptor.value.params === 'object'
    ? descriptor.value.params
    : {}
))
const requestId = computed(() => {
  const value = descriptorParams.value.requestId
  return typeof value === 'string' ? value : undefined
})
const summary = computed(() => {
  const value = descriptorParams.value.confirmationSummary
  return typeof value === 'string' && value.trim()
    ? value
    : `Allow tool call ${getMessageToolCallName(props.toolCall)}?`
})
const argumentsPreview = computed(() => {
  const preview = descriptorParams.value.argumentsPreview
  if (typeof preview === 'string') {
    return preview
  }

  const params = getMessageToolCallArgs(props.toolCall)
  if (!params || typeof params !== 'object') {
    return ''
  }
  return JSON.stringify(params, null, 2)
})
const externallyResolved = computed(() => (
  requestId.value ? props.answeredClientRequestIds?.has(requestId.value) === true : false
))
const resolved = computed(() => Boolean(localDecision.value) || externallyResolved.value || props.toolCall.done)
const showConversationAction = computed(() => descriptorParams.value.allowConversation === true)
const showAlwaysAction = computed(() => descriptorParams.value.allowAlways === true)
const resolvedTitle = computed(() => {
  if (localDecision.value === 'deny' || props.toolCall.state === 'canceled') {
    return 'Denied tool call'
  }

  return 'Allowed tool call'
})

function respond(decision: ToolConfirmationDecision) {
  if (!requestId.value || resolved.value) {
    return
  }

  localDecision.value = decision
  emit('client-response', {
    id: requestId.value,
    payload: { decision },
  })
}
</script>

<style scoped>
.chat-tool-confirmation {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: min(100%, 42rem);
  padding: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
  color: var(--color-text);
}

.chat-tool-confirmation--resolved {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
}

.chat-tool-confirmation__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.chat-tool-confirmation__tag {
  width: fit-content;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, transparent);
  border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-3);
  background: var(--cc-selection-bg);
  color: var(--color-primary);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-16);
}

.chat-tool-confirmation__question {
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-20);
}

.chat-tool-confirmation__details {
  margin: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-20);
}

.chat-tool-confirmation__details-summary {
  width: fit-content;
  cursor: pointer;
}

.chat-tool-confirmation__details-body {
  max-height: 12rem;
  overflow: auto;
  margin: var(--space-3) 0 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-low);
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-12);
  line-height: var(--line-height-20);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.chat-tool-confirmation__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.chat-tool-confirmation__button {
  min-height: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0 var(--space-6);
  background: var(--color-surface-base);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.chat-tool-confirmation__button:hover {
  background: var(--color-surface-low);
}

.chat-tool-confirmation__button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: var(--space-1);
}

.chat-tool-confirmation__button--primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--cc-text-inverse);
}

.chat-tool-confirmation__button--primary:hover {
  background: var(--cc-send-bg-hover);
}

.chat-tool-confirmation__summary {
  color: var(--color-text-muted);
}
</style>
