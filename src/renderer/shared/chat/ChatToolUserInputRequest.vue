<template>
  <section
    class="chat-tool-user-input"
    :class="{ 'chat-tool-user-input--resolved': resolved }"
  >
    <div v-if="resolved" class="chat-tool-user-input__summary">
      <ChatToolCallTitle title="Answered user question" />
    </div>

    <template v-else>
      <header class="chat-tool-user-input__header">
        <span class="chat-tool-user-input__tag">User input required</span>
        <span class="chat-tool-user-input__question">{{ primaryQuestion }}</span>
      </header>

      <div class="chat-tool-user-input__questions">
        <label
          v-for="question in questions"
          :key="question.id"
          class="chat-tool-user-input__field"
        >
          <span class="chat-tool-user-input__field-label">{{ question.header || question.question }}</span>
          <div
            v-if="question.options?.length"
            class="chat-tool-user-input__options"
          >
            <button
              v-for="option in question.options"
              :key="option.label"
              class="chat-tool-user-input__option"
              :class="{ 'chat-tool-user-input__option--selected': answers[question.id] === option.label }"
              type="button"
              @click="answers[question.id] = option.label"
            >
              <span>{{ option.label }}</span>
              <small v-if="option.description">{{ option.description }}</small>
            </button>
          </div>
          <input
            v-if="question.isOther || !question.options?.length"
            v-model="answers[question.id]"
            class="chat-tool-user-input__input"
            :placeholder="question.question"
            :type="question.isSecret ? 'password' : 'text'"
          >
        </label>
      </div>

      <footer class="chat-tool-user-input__actions">
        <button
          class="chat-tool-user-input__button chat-tool-user-input__button--primary"
          :disabled="!canSubmit"
          type="button"
          @click="submit"
        >
          Send
        </button>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { AskUserAnswers, AskUserQuestion } from '../../../shared/contracts'
import ChatToolCallTitle from './ChatToolCallTitle.vue'
import { parseToolStatusDescriptor } from './tool-status'
import type { MessageToolCall } from './types'

const props = defineProps<{
  answeredClientRequestIds?: Set<string>
  toolCall: MessageToolCall
}>()

const emit = defineEmits<{
  'client-response': [response: { id: string; payload: { answers: AskUserAnswers } }]
}>()

const localAnswered = ref(false)
const answers = reactive<Record<string, string>>({})
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
const questions = computed(() => normalizeQuestions(descriptorParams.value.questions))
const primaryQuestion = computed(() => questions.value[0]?.question ?? 'Codex needs more information.')
const externallyResolved = computed(() => (
  requestId.value ? props.answeredClientRequestIds?.has(requestId.value) === true : false
))
const resolved = computed(() => localAnswered.value || externallyResolved.value || props.toolCall.done)
const canSubmit = computed(() => questions.value.length > 0 && questions.value.every((question) => answerForQuestion(question).length > 0))

function submit() {
  if (!requestId.value || resolved.value || !canSubmit.value) {
    return
  }

  const payloadAnswers: AskUserAnswers = {}
  for (const question of questions.value) {
    payloadAnswers[question.id] = {
      answers: [answerForQuestion(question)],
    }
  }

  localAnswered.value = true
  emit('client-response', {
    id: requestId.value,
    payload: {
      answers: payloadAnswers,
    },
  })
}

function answerForQuestion(question: AskUserQuestion): string {
  return (answers[question.id] ?? '').trim()
}

function normalizeQuestions(value: unknown): AskUserQuestion[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((question): question is AskUserQuestion => {
    return Boolean(
      question &&
      typeof question === 'object' &&
      'id' in question &&
      typeof question.id === 'string' &&
      'question' in question &&
      typeof question.question === 'string'
    )
  })
}
</script>

<style scoped>
.chat-tool-user-input {
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

.chat-tool-user-input--resolved {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
}

.chat-tool-user-input__header,
.chat-tool-user-input__questions,
.chat-tool-user-input__field {
  display: flex;
  flex-direction: column;
}

.chat-tool-user-input__header,
.chat-tool-user-input__field {
  gap: var(--space-4);
}

.chat-tool-user-input__questions {
  gap: var(--space-6);
}

.chat-tool-user-input__tag {
  width: fit-content;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, transparent);
  border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-3);
  background: var(--color-primary-container);
  color: var(--color-primary);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-16);
}

.chat-tool-user-input__question {
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-20);
}

.chat-tool-user-input__field-label {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
}

.chat-tool-user-input__options {
  display: grid;
  gap: var(--space-3);
}

.chat-tool-user-input__option {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: flex-start;
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-base);
  color: var(--color-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.chat-tool-user-input__option small {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.chat-tool-user-input__option--selected {
  border-color: var(--color-primary);
  background: var(--color-primary-container);
}

.chat-tool-user-input__input {
  min-height: 34px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0 var(--space-4);
  background: var(--color-surface-low);
  color: var(--color-text);
}

.chat-tool-user-input__input:focus-visible,
.chat-tool-user-input__option:focus-visible,
.chat-tool-user-input__button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: var(--space-1);
}

.chat-tool-user-input__actions {
  display: flex;
  justify-content: flex-end;
}

.chat-tool-user-input__button {
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

.chat-tool-user-input__button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.chat-tool-user-input__button--primary:not(:disabled) {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-on-primary);
}

.chat-tool-user-input__summary {
  color: var(--color-text-muted);
}
</style>
