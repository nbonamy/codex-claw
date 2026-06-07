<template>
  <div class="message-list" ref="el" @scroll="updateStickiness($event)">
    <div class="message-list__content">
      <ChatMessage
        v-for="(msg, index) in messages"
        :key="index"
        :actions-disabled="actionsDisabled"
        :answered-client-request-ids="answeredClientRequestIds"
        :can-delete-message="canDeleteMessage"
        :can-edit-message="canEditMessage"
        :can-retry-message="canRetryMessage"
        :follow-ups-disabled="followUpsDisabled"
        :index="index"
        :message="msg"
        :undoing-change-set-id="undoingChangeSetId"
        @cancel="emit('cancel')"
        @client-response="emit('client-response', $event)"
        @copy-message="emit('copy-message', $event)"
        @delete-message="emit('delete-message', $event)"
        @edit-message="emit('edit-message', $event)"
        @quote-message="emit('quote-message', $event)"
        @review-file="emit('review-file', $event)"
        @retry-message="emit('retry-message', $event)"
        @send-follow-up="emit('send-follow-up', $event)"
        @undo-change-set="emit('undo-change-set', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import type { ClientRequestResponse } from '../../../shared/contracts'
import type { Message } from './types'
import ChatMessage from './ChatMessage.vue'

const props = withDefaults(defineProps<{
  actionsDisabled?: boolean
  answeredClientRequestIds?: Set<string>
  canDeleteMessage?: boolean
  canEditMessage?: boolean
  canRetryMessage?: boolean
  followUpsDisabled?: boolean
  messages: Message[]
  undoingChangeSetId?: string | null
}>(), {
  canDeleteMessage: true,
  canEditMessage: true,
  canRetryMessage: true,
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

const el = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)
const previousMessagesRef = ref<Message[] | null>(props.messages)
const previousMessageCount = ref(props.messages.length)
const bottomThreshold = 24

function isAtBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= bottomThreshold
}

function scrollToBottom() {
  if (!el.value) {
    return
  }

  el.value.scrollTop = el.value.scrollHeight
  stickToBottom.value = true
}

function updateStickiness(event: Event) {
  stickToBottom.value = isAtBottom(event.currentTarget as HTMLElement)
}

onMounted(async () => {
  await nextTick()
  scrollToBottom()
})

watch(() => props.messages, async (messages) => {
  const forceScroll = messages !== previousMessagesRef.value || messages.length > previousMessageCount.value
  const shouldScroll = forceScroll || stickToBottom.value
  previousMessagesRef.value = messages
  previousMessageCount.value = messages.length

  await nextTick()
  if (shouldScroll) {
    scrollToBottom()
  }
}, { deep: true })
</script>

<style scoped>
.message-list {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  padding: var(--space-8) var(--space-16);
}

.message-list__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  width: min(100%, var(--message-list-content-width, 100%));
  margin: 0 auto;
  padding:
    calc(var(--message-list-content-padding-top, 0) + var(--space-2))
    0
    calc(var(--message-list-content-padding-bottom, 0) + var(--space-2));
}

</style>
