<template>
  <form class="repository-issue-composer" @submit.prevent="createIssue">
    <header>
      <div>
        <strong>{{ t('repositoryBacklog.createIssue') }}</strong>
        <span>{{ repositoryName }}</span>
      </div>
      <button type="button" :aria-label="t('repositoryBacklog.closeCreateIssue')" @click="emit('close')">
        <IconX aria-hidden="true" />
      </button>
    </header>

    <template v-if="state === 'idle' || state === 'error'">
      <div class="repository-issue-composer__field">
        <CodexComposerVoiceField
          v-if="voiceVisible && (voiceRecording || voiceTranscribing)"
          class="repository-issue-composer__voice-field"
          :recorder="voiceRecorder"
          :recording="voiceRecording"
        />
        <textarea
          v-else
          ref="textarea"
          v-model="description"
          :aria-label="t('repositoryBacklog.issueDescription')"
          :placeholder="t('repositoryBacklog.issueDescriptionPlaceholder')"
          rows="6"
          @blur="rememberSelection"
          @click="rememberSelection"
          @input="rememberSelection"
          @keyup="rememberSelection"
          @select="rememberSelection"
        />
        <CodexComposerVoiceButton
          v-if="voiceVisible"
          class="repository-issue-composer__voice-button"
          :disabled="voiceButtonDisabled"
          :label="voiceButtonLabel"
          :recording="voiceRecording"
          :title="voiceButtonTitle"
          @toggle="voiceController.toggle"
        />
      </div>

      <p class="repository-issue-composer__hint">
        <IconSparkles aria-hidden="true" />
        {{ t('repositoryBacklog.issueDraftHint') }}
      </p>
      <p v-if="error" class="repository-issue-composer__error" role="alert">{{ error }}</p>

      <footer>
        <button class="claw-button claw-button--tertiary" type="button" @click="emit('close')">{{ t('repositoryBacklog.cancel') }}</button>
        <button class="claw-button claw-button--primary" type="submit" :disabled="submitDisabled">
          <IconSparkles aria-hidden="true" />
          {{ t('repositoryBacklog.createWithCodex') }}
        </button>
      </footer>
    </template>

    <div v-else class="repository-issue-composer__status" :data-state="state" role="status" aria-live="polite">
      <span v-if="state === 'running'" class="repository-issue-composer__spinner" aria-hidden="true" />
      <IconCircleCheck v-else aria-hidden="true" />
      <strong>{{ state === 'running' ? t('repositoryBacklog.draftingIssue') : t('repositoryBacklog.issueCreated', { number: createdNumber }) }}</strong>
      <span>{{ state === 'running' ? t('repositoryBacklog.draftingIssueDetail') : t('repositoryBacklog.issueCreatedDetail') }}</span>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { IconCircleCheck, IconSparkles, IconX } from '@tabler/icons-vue';
import {
  CodexComposerVoiceButton,
  CodexComposerVoiceField,
  getCodexNativeRendererApi,
  useCodexComposerVoice,
} from '@codex-app-sdk/vue';
import type { WorkItem } from '@codex-claw/core/contracts';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  createAction: (description: string) => Promise<WorkItem>;
  repositoryName: string;
}>();

const emit = defineEmits<{
  close: [];
  created: [item: WorkItem];
}>();

const { t } = useI18n();

const description = ref('');
const error = ref<string | null>(null);
const state = ref<'idle' | 'running' | 'success' | 'error'>('idle');
const createdNumber = ref<number | null>(null);
const textarea = ref<HTMLTextAreaElement | null>(null);
const selectionStart = ref(0);
const selectionEnd = ref(0);
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const voiceVisible = computed(() => getCodexNativeRendererApi()?.capabilities.transcription === true);
const voiceController = useCodexComposerVoice({
  isDisabled: () => state.value === 'running' || state.value === 'success',
  isSending: () => state.value === 'running',
  onTranscript: insertTranscript,
});
const voiceButtonDisabled = computed(() => voiceController.buttonDisabled.value);
const voiceButtonLabel = computed(() => voiceController.buttonLabel.value);
const voiceButtonTitle = computed(() => voiceController.buttonTitle.value);
const voiceRecorder = computed(() => voiceController.recorder.value);
const voiceRecording = computed(() => voiceController.isRecording.value);
const voiceTranscribing = computed(() => voiceController.isTranscribing.value);
const submitDisabled = computed(() => !description.value.trim() || voiceRecording.value || voiceTranscribing.value || state.value === 'running');

onMounted(() => void nextTick(() => textarea.value?.focus()));

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer);
  voiceController.dispose();
});

function rememberSelection(): void {
  selectionStart.value = textarea.value?.selectionStart ?? description.value.length;
  selectionEnd.value = textarea.value?.selectionEnd ?? selectionStart.value;
}

function insertTranscript(value: string): void {
  const transcript = value.trim();
  if (!transcript) return;
  const start = Math.min(selectionStart.value, description.value.length);
  const end = Math.min(Math.max(selectionEnd.value, start), description.value.length);
  const before = description.value.slice(0, start);
  const after = description.value.slice(end);
  const prefix = before && !/\s$/u.test(before) ? ' ' : '';
  const suffix = after && !/^\s/u.test(after) ? ' ' : '';
  const insertion = `${prefix}${transcript}${suffix}`;
  const caret = before.length + insertion.length;
  description.value = `${before}${insertion}${after}`;
  selectionStart.value = caret;
  selectionEnd.value = caret;
  void nextTick(() => {
    textarea.value?.focus();
    textarea.value?.setSelectionRange(caret, caret);
  });
}

async function createIssue(): Promise<void> {
  const value = description.value.trim();
  if (!value || submitDisabled.value) return;
  state.value = 'running';
  error.value = null;
  try {
    const item = await props.createAction(value);
    createdNumber.value = item.number;
    state.value = 'success';
    emit('created', item);
    closeTimer = setTimeout(() => emit('close'), 1_400);
  } catch (cause) {
    state.value = 'error';
    error.value = cause instanceof Error ? cause.message : String(cause);
    await nextTick();
    textarea.value?.focus();
  }
}
</script>

<style scoped>
.repository-issue-composer {
  display: grid;
  gap: var(--space-6);
  padding: var(--space-10);
  color: var(--color-text);
}

.repository-issue-composer > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.repository-issue-composer > header > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.repository-issue-composer > header strong {
  font-size: var(--font-size-18);
}

.repository-issue-composer > header span {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-issue-composer > header button {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.repository-issue-composer > header button:hover {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.repository-issue-composer > header button svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.repository-issue-composer__field {
  position: relative;
  min-height: 146px;
  border: 0;
  background: transparent;
}

.repository-issue-composer__field textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 146px;
  resize: none;
  padding: var(--space-4) var(--space-10) var(--space-4) 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--color-text);
  font: inherit;
  line-height: 1.5;
}

.repository-issue-composer__voice-field {
  min-height: 146px;
}

.repository-issue-composer__voice-button {
  position: absolute;
  right: 0;
  bottom: var(--space-4);
}

.repository-issue-composer__hint,
.repository-issue-composer__error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}

.repository-issue-composer__hint svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  color: var(--color-primary);
}

.repository-issue-composer__error {
  color: var(--color-error);
}

.repository-issue-composer > footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-2);
}

.repository-issue-composer > footer button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.repository-issue-composer > footer svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.repository-issue-composer__status {
  display: grid;
  place-items: center;
  gap: var(--space-2);
  min-height: 210px;
  text-align: center;
}

.repository-issue-composer__status > svg {
  width: 30px;
  height: 30px;
  color: var(--color-success);
}

.repository-issue-composer__status > span:last-child {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}

.repository-issue-composer__spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: repository-issue-composer-spin 0.8s linear infinite;
}

@keyframes repository-issue-composer-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
