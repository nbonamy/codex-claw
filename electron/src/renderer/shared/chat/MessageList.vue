<template>
  <CodexMessageList class="message-list" :messages="messages">
    <template #message="{ message: msg, index }">
      <ChatMessage
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
    </template>
  </CodexMessageList>
</template>

<script setup lang="ts">
import type { ClientRequestResponse } from '@codex-claw/shared/contracts'
import { CodexMessageList } from 'codex-app-sdk/vue'
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

</script>

<style scoped>
.message-list {
  --codex-message-list-padding: var(--space-8) var(--space-16);
  --codex-message-list-gap: var(--space-8);
  --codex-message-list-content-width: var(--message-list-content-width, 100%);
  --codex-message-list-content-padding:
    calc(var(--message-list-content-padding-top, 0) + var(--space-2))
    0
    calc(var(--message-list-content-padding-bottom, 0) + var(--space-2));
}

</style>
