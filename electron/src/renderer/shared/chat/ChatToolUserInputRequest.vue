<template>
  <span
    v-if="questions.length === 0"
    class="chat-message__thinking text-shimmer"
    data-label="Thinking"
  >
    <SquareDashed :size="15" />
    Preparing question...
  </span>

  <section
    v-else
    class="chat-tool-user-input"
    :class="{ 'chat-tool-user-input--resolved': cancelled || answered }"
  >
    <div v-if="cancelled" class="chat-tool-user-input__summary chat-tool-user-input__summary--muted">
      <ChatToolCallTitle title="Cancelled user question" :icon="SquareX" />
    </div>

    <div v-else-if="answered" class="chat-tool-user-input__summary chat-tool-user-input__summary--answered">
      <ChatToolCallTitle title="Answered user question" :icon="SquareCheck" />
      <div
        v-for="question in questions"
        :key="question.id"
        class="chat-tool-user-input__answer"
      >
        <span class="chat-tool-user-input__answer-label">{{ question.header }}</span>
        <span class="chat-tool-user-input__answer-value">{{ answerSummary[question.id] }}</span>
      </div>
    </div>

    <template v-else-if="currentQuestion">
      <header class="chat-tool-user-input__header">
        <div class="chat-tool-user-input__heading">
          <span class="chat-tool-user-input__tag">{{ currentQuestion.header }}</span>
          <span class="chat-tool-user-input__question">{{ currentQuestion.question }}</span>
        </div>
        <div
          v-if="questions.length > 1"
          class="chat-tool-user-input__progress"
          aria-label="Question progress"
        >
          <span
            v-for="(_, index) in questions"
            :key="index"
            class="chat-tool-user-input__progress-dot"
            :class="{ 'chat-tool-user-input__progress-dot--active': index === currentIndex }"
          />
          <span class="chat-tool-user-input__index">
            {{ currentIndex + 1 }} / {{ questions.length }}
          </span>
        </div>
      </header>

      <div class="chat-tool-user-input__options">
        <button
          v-for="option in currentQuestion.options ?? []"
          :key="option.label"
          class="chat-tool-user-input__option"
          :class="{ 'chat-tool-user-input__option--selected': isSelected(currentQuestion.id, option.label) }"
          type="button"
          @click="toggleOption(currentQuestion, option.label)"
        >
          <span class="chat-tool-user-input__check">
            <Check v-if="isSelected(currentQuestion.id, option.label)" class="chat-tool-user-input__icon chat-tool-user-input__icon--checked" :size="16" />
            <Circle v-else class="chat-tool-user-input__icon" :size="16" />
          </span>
          <span class="chat-tool-user-input__option-copy">
            <span class="chat-tool-user-input__option-label">{{ option.label }}</span>
            <span v-if="option.description" class="chat-tool-user-input__option-description">{{ option.description }}</span>
          </span>
        </button>

        <div
          v-if="currentQuestion.isOther || !currentQuestion.options?.length"
          class="chat-tool-user-input__option chat-tool-user-input__option--other"
          :class="{ 'chat-tool-user-input__option--selected': isOtherSelected(currentQuestion.id) }"
          role="button"
          tabindex="0"
          @click="toggleOther(currentQuestion)"
          @keydown.enter.prevent="toggleOther(currentQuestion)"
          @keydown.space.prevent="toggleOther(currentQuestion)"
        >
          <span class="chat-tool-user-input__check">
            <Check v-if="isOtherSelected(currentQuestion.id)" class="chat-tool-user-input__icon chat-tool-user-input__icon--checked" :size="16" />
            <Circle v-else class="chat-tool-user-input__icon" :size="16" />
          </span>
          <span class="chat-tool-user-input__option-copy">
            <span class="chat-tool-user-input__option-label">Other</span>
          </span>
          <textarea
            v-if="isOtherSelected(currentQuestion.id)"
            v-model="otherTexts[currentQuestion.id]"
            class="chat-tool-user-input__other-input"
            :placeholder="currentQuestion.isSecret ? 'Enter private answer' : 'Type your answer...'"
            rows="2"
            :type="currentQuestion.isSecret ? 'password' : 'text'"
            @click.stop
            @focus="selectOther(currentQuestion)"
            @input="selectOther(currentQuestion)"
            @keydown.stop
          />
        </div>
      </div>

      <footer class="chat-tool-user-input__actions">
        <button
          class="chat-tool-user-input__button chat-tool-user-input__button--primary"
          :disabled="!canProceed"
          type="button"
          @click="isLastQuestion ? submit() : next()"
        >
          {{ isLastQuestion ? 'Send' : 'Next' }}
        </button>
        <button
          v-if="currentIndex > 0"
          class="chat-tool-user-input__button"
          type="button"
          @click="back"
        >
          Back
        </button>
        <button class="chat-tool-user-input__button" type="button" @click="cancel">
          Cancel
        </button>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { AskUserAnswers, AskUserQuestion } from '@codex-claw/shared/contracts'
import { Check, Circle, SquareCheck, SquareDashed, SquareX } from '../icons/app-icons'
import ChatToolCallTitle from './ChatToolCallTitle.vue'
import { parseToolStatusDescriptor } from './tool-status'
import type { MessageToolCall } from './types'

const props = defineProps<{
  answeredClientRequestIds?: Set<string>
  toolCall: MessageToolCall
}>()

const emit = defineEmits<{
  'client-response': [response: { id: string; payload: { answers: AskUserAnswers; cancelled?: boolean } }]
}>()

const currentIndex = ref(0)
const localAnswered = ref(false)
const localCancelled = ref(false)
const selections = reactive<Record<string, string[]>>({})
const otherSelected = reactive<Record<string, boolean>>({})
const otherTexts = reactive<Record<string, string>>({})

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
const currentQuestion = computed(() => questions.value[currentIndex.value])
const isLastQuestion = computed(() => currentIndex.value === questions.value.length - 1)
const resultAnswers = computed<AskUserAnswers>(() => {
  const result = props.toolCall.result as { answers?: AskUserAnswers } | undefined
  return result?.answers && typeof result.answers === 'object' ? result.answers : {}
})
const externallyResolved = computed(() => (
  requestId.value ? props.answeredClientRequestIds?.has(requestId.value) === true : false
))
const answered = computed(() => localAnswered.value || Object.keys(resultAnswers.value).length > 0 || (externallyResolved.value && !localCancelled.value))
const cancelled = computed(() => localCancelled.value || props.toolCall.state === 'canceled')
const answerSummary = computed(() => {
  const summary: Record<string, string> = {}
  for (const question of questions.value) {
    summary[question.id] = formatAnswer(resultAnswers.value[question.id] ?? buildAnswer(question))
  }
  return summary
})
const canProceed = computed(() => {
  const question = currentQuestion.value
  if (!question || !hasAnswerFor(question)) {
    return false
  }

  return !isLastQuestion.value || questions.value.every((entry) => hasAnswerFor(entry))
})

function isSelected(questionId: string, label: string) {
  return selections[questionId]?.includes(label) ?? false
}

function isOtherSelected(questionId: string) {
  return otherSelected[questionId] ?? false
}

function toggleOption(question: AskUserQuestion, label: string) {
  if (answered.value || cancelled.value) {
    return
  }

  const questionId = question.id
  selections[questionId] ??= []
  if (question.multiSelect) {
    const index = selections[questionId].indexOf(label)
    if (index >= 0) {
      selections[questionId].splice(index, 1)
    } else {
      selections[questionId].push(label)
    }
    return
  }

  selections[questionId] = selections[questionId].includes(label) ? [] : [label]
  otherSelected[questionId] = false
  otherTexts[questionId] = ''
}

function toggleOther(question: AskUserQuestion) {
  if (answered.value || cancelled.value) {
    return
  }

  const questionId = question.id
  otherSelected[questionId] = !otherSelected[questionId]
  if (!question.multiSelect) {
    selections[questionId] = []
  }

  if (!otherSelected[questionId]) {
    otherTexts[questionId] = ''
  }
}

function selectOther(question: AskUserQuestion) {
  if (answered.value || cancelled.value) {
    return
  }

  otherSelected[question.id] = true
  if (!question.multiSelect) {
    selections[question.id] = []
  }
}

function hasAnswerFor(question: AskUserQuestion) {
  return (selections[question.id]?.length ?? 0) > 0 || (otherSelected[question.id] && !!otherTexts[question.id]?.trim())
}

function next() {
  if (canProceed.value) {
    currentIndex.value += 1
  }
}

function back() {
  if (currentIndex.value > 0) {
    currentIndex.value -= 1
  }
}

function submit() {
  if (!requestId.value || answered.value || cancelled.value || !canProceed.value) {
    return
  }

  const answers = questions.value.reduce<AskUserAnswers>((acc, question) => {
    acc[question.id] = buildAnswer(question)
    return acc
  }, {})

  localAnswered.value = true
  emit('client-response', {
    id: requestId.value,
    payload: { answers },
  })
}

function cancel() {
  if (!requestId.value || answered.value || cancelled.value) {
    return
  }

  localCancelled.value = true
  emit('client-response', {
    id: requestId.value,
    payload: {
      answers: {},
      cancelled: true,
    },
  })
}

function buildAnswer(question: AskUserQuestion): { answers: string[] } {
  const answers = [...(selections[question.id] ?? [])]
  const otherText = otherTexts[question.id]?.trim()
  if (otherSelected[question.id] && otherText) {
    answers.push(otherText)
  }
  return { answers }
}

function formatAnswer(answer: { answers: string[] } | undefined) {
  return answer?.answers.filter(Boolean).join(', ') || '-'
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
  }).map((question) => ({
    ...question,
    header: question.header || question.question,
    isOther: question.isOther ?? false,
    isSecret: question.isSecret ?? false,
    options: Array.isArray(question.options) ? question.options : null,
  }))
}
</script>

<style scoped>
.chat-message__thinking {
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  color: var(--color-text-muted);
}

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
  border-radius: 0;
  background: transparent;
}

.chat-tool-user-input__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-6);
}

.chat-tool-user-input__heading,
.chat-tool-user-input__options,
.chat-tool-user-input__summary {
  display: flex;
  flex-direction: column;
}

.chat-tool-user-input__heading {
  gap: var(--space-8);
  min-width: 0;
}

.chat-tool-user-input__options {
  gap: var(--space-3);
}

.chat-tool-user-input__summary {
  gap: var(--space-2);
  color: var(--color-text-muted);
}

.chat-tool-user-input__summary--muted {
  opacity: 0.72;
}

.chat-tool-user-input__summary--answered {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: var(--space-4);
}

.chat-tool-user-input__summary--answered :deep(.chat-tool-call__title) {
  grid-column: 1 / -1;
}

.chat-tool-user-input__tag,
.chat-tool-user-input__answer-label {
  width: fit-content;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--color-primary) 24%, transparent);
  border-radius: var(--radius-full);
  padding: var(--space-1) var(--space-3);
  background: color-mix(in srgb, var(--color-primary-container) 74%, var(--color-surface-lowest));
  color: var(--color-primary);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-16);
}

.chat-tool-user-input__question {
  min-width: 0;
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-20);
}

.chat-tool-user-input__progress {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
}

.chat-tool-user-input__index {
  flex: 0 0 auto;
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
}

.chat-tool-user-input__progress-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-full);
  background: var(--color-border-strong);
  opacity: 0.45;
}

.chat-tool-user-input__progress-dot--active {
  width: 12px;
  background: var(--color-primary);
  opacity: 1;
}

.chat-tool-user-input__answer,
.chat-tool-user-input__option {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-6);
  background: var(--color-surface-lowest);
  color: inherit;
  font: inherit;
  text-align: left;
}

.chat-tool-user-input__answer {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: center;
  margin-top: var(--space-2);
  margin-left: var(--space-10);
  border: 0;
  padding: 0;
  background: transparent;
}

.chat-tool-user-input__option {
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.chat-tool-user-input__option:hover {
  border-color: color-mix(in srgb, var(--color-primary) 60%, var(--color-border));
}

.chat-tool-user-input__option--selected {
  border-color: color-mix(in srgb, var(--color-primary) 58%, var(--color-border));
  background: color-mix(in srgb, var(--color-primary-container) 66%, var(--color-surface-lowest));
}

.chat-tool-user-input__check {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 20px;
}

.chat-tool-user-input__icon {
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.chat-tool-user-input__icon--checked {
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-on-primary);
  padding: var(--space-2);
  stroke-width: var(--space-3);
}

.chat-tool-user-input__option-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.chat-tool-user-input__option-label {
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-20);
}

.chat-tool-user-input__option-description,
.chat-tool-user-input__answer-value {
  min-width: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
}

.chat-tool-user-input--resolved .chat-tool-user-input__answer-label {
  justify-self: end;
  border: none;
  border-radius: 0;
  font-size: var(--font-size-13);
  text-align: right;
}

.chat-tool-user-input__option--other {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: start;
}

.chat-tool-user-input__other-input {
  grid-column: 2;
  width: 100%;
  min-width: 0;
  margin-top: var(--space-1);
  resize: vertical;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-lowest);
  color: var(--color-text);
  font: inherit;
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
}

.chat-tool-user-input__other-input:focus {
  outline: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
}

.chat-tool-user-input__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
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

.chat-tool-user-input__input:focus-visible,
.chat-tool-user-input__option:focus-visible,
.chat-tool-user-input__button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: var(--space-1);
}

@media (max-width: 520px) {
  .chat-tool-user-input {
    padding: var(--space-6);
  }

  .chat-tool-user-input__header {
    flex-direction: column;
  }

  .chat-tool-user-input__actions {
    align-items: stretch;
  }

  .chat-tool-user-input__button {
    flex: 1 1 auto;
  }
}
</style>
