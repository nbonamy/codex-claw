<template>
  <div
    class="chat-message-actions"
    :class="`chat-message-actions--${message.role}`"
    :aria-label="t('chat.actions.label')"
  >
    <span
      v-if="sentAtLabel && message.role === 'user'"
      class="chat-message-actions__sent-at"
      :title="sentAtTitle"
    >
      {{ sentAtLabel }}
    </span>
    <ChatIconButton
      :label="copied ? t('chat.actions.copied') : t('chat.actions.copy')"
      @click="emit('copy')"
    >
      <CheckIcon v-if="copied" />
      <CopyIcon v-else />
    </ChatIconButton>
    <ChatIconButton
      v-if="message.role === 'user' && canEdit"
      :label="t('chat.actions.edit')"
      @click="emit('edit')"
    >
      <PencilIcon />
    </ChatIconButton>
    <ChatIconButton
      v-if="message.role === 'user'"
      :label="t('chat.actions.quote')"
      @click="emit('quote')"
    >
      <QuoteIcon />
    </ChatIconButton>
    <ChatIconButton
      v-if="message.role === 'assistant' && canRetry"
      :label="t('chat.actions.retry')"
      @click="emit('retry')"
    >
      <RotateClockwiseIcon />
    </ChatIconButton>
    <ChatIconButton
      v-if="canDelete"
      danger
      :label="t('chat.actions.delete')"
      @click="emit('delete')"
    >
      <Trash2Icon />
    </ChatIconButton>
    <span
      v-if="sentAtLabel && message.role === 'assistant'"
      class="chat-message-actions__sent-at"
      :title="sentAtTitle"
    >
      {{ sentAtLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { CheckIcon, CopyIcon, PencilIcon, QuoteIcon, RotateClockwiseIcon, Trash2Icon } from '../icons/app-icons'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ChatIconButton from './ChatIconButton.vue'
import { formatMessageSentAt, fullMessageSentAt } from './message-time'
import type { Message } from './types'

const props = withDefaults(defineProps<{
  canDelete?: boolean
  canEdit?: boolean
  canRetry?: boolean
  copied?: boolean
  message: Message
}>(), {
  canDelete: true,
  canEdit: true,
  canRetry: true,
})

const emit = defineEmits<{
  copy: []
  delete: []
  edit: []
  quote: []
  retry: []
}>()
const { t } = useI18n()
const sentAtLabel = computed(() => props.message.createdAt ? formatMessageSentAt(props.message.createdAt) : '')
const sentAtTitle = computed(() => props.message.createdAt ? fullMessageSentAt(props.message.createdAt) : undefined)
</script>

<style scoped>
.chat-message-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) 0;
}

.chat-message-actions--user {
  justify-content: flex-end;
}

.chat-message-actions--assistant {
  justify-content: flex-start;
}

.chat-message-actions__sent-at {
  color: var(--color-outline);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-16);
  white-space: nowrap;
}
</style>
