<template>
  <div
    v-if="message.type === 'compaction'"
    class="chat-message chat-message--compaction"
    :class="{ 'chat-message--compaction-running': message.compactionStatus === 'running' }"
  >
    <div class="chat-message__compaction-line" />
    <span
      class="chat-message__compaction-title"
      :data-label="compactionTitle"
    >
      <span
        class="chat-message__compaction-label"
        :class="{ 'text-shimmer': message.compactionStatus === 'running' }"
      >
        {{ compactionTitle }}
      </span>
    </span>
  </div>
  <!-- <div v-else-if="message.type === 'steer'" class="chat-message chat-message--steer">
    <div class="chat-message__steer-line" />
    <div class="chat-message__steer-body">
      <span class="chat-message__steer-title">Steered conversation</span>
      <span class="chat-message__steer-text">{{ message.content }}</span>
    </div>
  </div> -->
  <div
    v-else
    class="chat-message"
    :class="[`chat-message--${message.role}`, { 'chat-message--editing': isEditing }]"
  >
    <div class="chat-message__body">
      <div class="chat-message__stack">
        <template v-if="isEditing">
          <div class="chat-message__edit-card">
            <textarea
              ref="editInput"
              v-model="draft"
              class="chat-message__edit-input"
              :aria-label="t('chat.actions.editPrompt')"
              @keydown.escape.prevent="cancelEdit"
              @keydown.meta.enter.prevent="saveEdit"
              @keydown.ctrl.enter.prevent="saveEdit"
            />
            <div class="chat-message__edit-actions">
              <button type="button" class="chat-message__edit-button" @click="cancelEdit">
                {{ t('chat.actions.cancel') }}
              </button>
              <button type="button" class="chat-message__edit-button chat-message__edit-button--primary" @click="saveEdit">
                {{ t('chat.actions.resubmit') }}
              </button>
            </div>
          </div>
        </template>
        <template v-else>
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
        </template>
      </div>
      <ChatMessageActions
        v-if="renderActionSlot"
        class="chat-message__actions"
        :class="{ 'chat-message__actions--reserved': reserveActionSlot }"
        :aria-hidden="reserveActionSlot ? 'true' : undefined"
        :inert="reserveActionSlot ? '' : undefined"
        :can-delete="canDeleteMessage"
        :can-edit="canEditMessage"
        :can-retry="canRetryMessage"
        :copied="copied"
        :message="message"
        @copy="copyMessage"
        @delete="deleteMessage"
        @edit="startEdit"
        @quote="emit('quote-message', index)"
        @retry="retryMessage"
      />
      <div v-if="message.type === 'steer'" class="chat-message--steer">
        Steered conversation
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ClientRequestResponse } from '@codex-claw/shared/contracts'
import type { Message } from './types'
import type { MessageBlock } from './message-blocks'
import ChatMessageBlock from './ChatMessageBlock.vue'
import ChatMessageActions from './ChatMessageActions.vue'
import { computeMessageBlocks } from './message-blocks'
import { copyMessageToClipboard } from './message-actions'

const props = withDefaults(defineProps<{
  actionsDisabled?: boolean
  answeredClientRequestIds?: Set<string>
  canDeleteMessage?: boolean
  canEditMessage?: boolean
  canRetryMessage?: boolean
  followUpsDisabled?: boolean
  index?: number
  message: Message
}>(), {
  canDeleteMessage: true,
  canEditMessage: true,
  canRetryMessage: true,
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

const { t } = useI18n()
const blocks = computed(() => computeMessageBlocks(props.message))
const copied = ref(false)
const draft = ref('')
const editInput = ref<HTMLTextAreaElement | null>(null)
const isEditing = ref(false)
let copyResetTimeout: ReturnType<typeof setTimeout> | null = null
let editFocusFrame: number | null = null

const showActions = computed(() => (
  props.message.type !== 'compaction' &&
  !isEditing.value
))
const reserveActionSlot = computed(() => (
  props.actionsDisabled ||
  (props.message.role === 'assistant' && props.message.streaming === true)
))
const renderActionSlot = computed(() => showActions.value)
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
const compactionTitle = computed(() => (
  props.message.compactionStatus === 'running'
    ? t('chat.compaction.running')
    : t('chat.compaction.completed')
))

watch(() => props.message.content, (content) => {
  if (isEditing.value) {
    draft.value = content
  }
})

function startEdit() {
  if (props.message.role !== 'user' || !props.canEditMessage) {
    return
  }

  draft.value = props.message.content
  isEditing.value = true
  editFocusFrame = requestAnimationFrame(() => {
    focusEditInput()
    editFocusFrame = null
  })
}

function cancelEdit() {
  if (editFocusFrame !== null) {
    cancelAnimationFrame(editFocusFrame)
    editFocusFrame = null
  }
  isEditing.value = false
  draft.value = ''
}

function saveEdit() {
  const content = draft.value.trim()
  if (!content) {
    return
  }

  emit('edit-message', { content, index: props.index })
  cancelEdit()
}

function deleteMessage() {
  if (!props.canDeleteMessage) {
    return
  }

  emit('delete-message', props.index)
}

function retryMessage() {
  if (!props.canRetryMessage) {
    return
  }

  emit('retry-message', props.index)
}

async function copyMessage() {
  await copyMessageToClipboard(props.message.content)
  copied.value = true
  emit('copy-message', props.index)

  if (copyResetTimeout) {
    clearTimeout(copyResetTimeout)
  }

  copyResetTimeout = setTimeout(() => {
    copied.value = false
    copyResetTimeout = null
  }, 1500)
}

function focusEditInput() {
  const input = editInput.value
  if (!input) {
    return
  }

  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

function isVisibleAssistantBlock(block: MessageBlock) {
  if (block.type === 'text') {
    return block.content.trim().length > 0
  }

  return block.type === 'media' || block.type === 'tool' || block.type === 'tool-group'
}

onBeforeUnmount(() => {
  if (copyResetTimeout) {
    clearTimeout(copyResetTimeout)
  }
  if (editFocusFrame !== null) {
    cancelAnimationFrame(editFocusFrame)
  }
})
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

.chat-message--compaction-running .chat-message__compaction-line {
  opacity: 0.64;
}

.chat-message--steer {
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
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
  display: inline-block;
  padding: 0 var(--space-6);
  background: var(--color-surface-lowest);
}

.chat-message__compaction-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
}

.chat-message__steer-line {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  border-top: 1px solid var(--color-border);
}

.chat-message__steer-body {
  z-index: 1;
  display: inline-flex;
  max-width: min(100%, 640px);
  align-items: baseline;
  gap: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-6);
  background: var(--color-surface-lowest);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.chat-message__steer-title {
  flex: 0 0 auto;
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
}

.chat-message__steer-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.chat-message--editing .chat-message__body {
  max-width: unset;
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
  background: var(--color-shell-sidebar);
  border-radius: var(--radius-xl);
  border-bottom-right-radius: var(--radius-xs);
}

.chat-message--editing .chat-message__stack {
  width: 100%;
  background: transparent;
  border-radius: 0;
}

.chat-message__actions {
  visibility: hidden;
}

.chat-message__actions--reserved {
  pointer-events: none;
}

.chat-message:hover .chat-message__actions,
.chat-message:focus-within .chat-message__actions {
  visibility: visible;
}

.chat-message:hover .chat-message__actions--reserved,
.chat-message:focus-within .chat-message__actions--reserved {
  visibility: hidden;
}

.chat-message__edit-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-8);
  background: var(--color-surface-lowest);
  color: var(--color-text);
}

.chat-message__edit-input {
  min-height: calc(var(--line-height-24) * 4);
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  line-height: var(--line-height-24);
  outline: none;
}

.chat-message__edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.chat-message__edit-button {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-6);
  background: var(--color-surface-lowest);
  color: var(--color-text);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.chat-message__edit-button:hover,
.chat-message__edit-button:focus-visible {
  background: var(--color-surface-low);
}

.chat-message__edit-button--primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.chat-message__edit-button--primary:hover,
.chat-message__edit-button--primary:focus-visible {
  border-color: var(--color-on-primary-container);
  background: var(--color-on-primary-container);
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
