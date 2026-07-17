<template>
  <div class="chat-message__edit-card">
    <textarea
      ref="input"
      v-model="draft"
      class="chat-message__edit-input"
      :aria-label="inputLabel"
      @keydown.escape.prevent="cancel"
      @keydown.meta.enter.prevent="save"
      @keydown.ctrl.enter.prevent="save"
    />
    <div class="chat-message__edit-actions">
      <button type="button" class="chat-message__edit-button" @click="cancel">
        {{ cancelLabel }}
      </button>
      <button
        type="button"
        class="chat-message__edit-button chat-message__edit-button--primary"
        @click="save"
      >
        {{ saveLabel }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  cancelLabel: string
  content: string
  inputLabel: string
  saveLabel: string
}>()
const emit = defineEmits<{
  cancel: []
  save: [content: string]
}>()

const draft = ref(props.content)
const input = ref<HTMLTextAreaElement | null>(null)
let focusFrame: number | null = null

watch(() => props.content, (content) => {
  draft.value = content
})

onMounted(() => {
  focusFrame = requestAnimationFrame(() => {
    input.value?.focus()
    input.value?.setSelectionRange(input.value.value.length, input.value.value.length)
    focusFrame = null
  })
})

onBeforeUnmount(() => {
  if (focusFrame !== null) {
    cancelAnimationFrame(focusFrame)
  }
})

function cancel(): void {
  emit('cancel')
}

function save(): void {
  const content = draft.value.trim()
  if (content) {
    emit('save', content)
  }
}
</script>

<style scoped>
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
</style>
