<template>
  <form
    class="chat-composer"
    :class="{ 'chat-composer--disabled': disabled && !isSending }"
    aria-label="Prompt composer"
    @submit.prevent="submitPrompt"
  >
    <ChatComposerFileMentionMenu
      v-if="fileMenuVisible"
      :active-index="activeFileIndex"
      :show-hint="fileMenuShowsHint"
      :visible-files="visibleFiles"
      @select="selectFile"
    />

    <ChatComposerSkillMenu
      v-if="skillMenuVisible"
      :active-index="activeSkillIndex"
      :visible-skills="visibleSkills"
      @select="selectSkill"
    />

    <ChatComposerActionMenu
      :disabled="disabled"
      :goal-mode="goalMode"
      :plan-mode="planMode"
      @attach="$emit('attach')"
      @update:goal-mode="$emit('update:goalMode', $event)"
      @update:plan-mode="$emit('update:planMode', $event)"
    />

    <div
      v-if="isRecording || isTranscribing"
      class="chat-composer__audio-field"
    >
      <ChatComposerWaveform
        v-if="isRecording"
        :active="isRecording"
        :audio-recorder="recorder"
        label="Audio waveform"
      />
      <span
        v-else
        class="chat-composer__audio-status"
      >
        Transcribing...
      </span>
    </div>
    <textarea
      v-else
      ref="textareaEl"
      v-model="prompt"
      class="chat-composer__input"
      :placeholder="placeholder"
      aria-label="Prompt"
      rows="1"
      :disabled="disabled && !isSending"
      @blur="closeComposerMenusSoon"
      @click="updateCaretPosition"
      @input="handleTextareaInput"
      @keydown="handleTextareaKeydown"
      @keyup="updateCaretPosition"
      @select="updateCaretPosition"
    />

    <div class="chat-composer__meta">
      <div
        v-if="activeModes.length > 0"
        class="chat-composer__modes"
        aria-label="Active composer modes"
      >
        <span
          v-for="mode in activeModes"
          :key="mode"
          class="chat-composer__mode"
        >
          {{ mode }}
        </span>
      </div>
      <ChatContextUsageIndicator :context-usage="contextUsage" />
      <ChatModelReasoningSelector
        :disabled="disabled || isSending"
        :models="models"
        :model-catalog-status="modelCatalogStatus"
        :model-id="selectedModelId"
        :reasoning-effort="selectedReasoningEffort"
        @update:model-id="$emit('update:modelId', $event)"
        @update:reasoning-effort="$emit('update:reasoningEffort', $event)"
      />
      <button
        class="chat-composer__voice"
        :class="{ 'chat-composer__voice--recording': isRecording }"
        type="button"
        :disabled="voiceButtonDisabled"
        :aria-pressed="isRecording"
        :aria-label="voiceButtonLabel"
        :title="voiceButtonTitle"
        @click="toggleRecording"
      >
        <MicrophoneIcon aria-hidden="true" />
      </button>
      <ChatComposerSendButton
        :disabled="sendButtonDisabled"
        :loading="sendButtonLoading"
        :label="sendButtonLabel"
        cancel-label="Codex is working"
        @click="handleSendButtonClick"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { AgentContextUsage, AgentFileSearchItem, CodexModelOption, CodexSkillSummary, ReasoningEffort } from '../../shared/contracts';
import ChatComposerSendButton from '../shared/chat/ChatComposerSendButton.vue';
import ChatComposerActionMenu from './ChatComposerActionMenu.vue';
import ChatContextUsageIndicator from './ChatContextUsageIndicator.vue';
import ChatModelReasoningSelector from './ChatModelReasoningSelector.vue';
import ChatComposerFileMentionMenu from './ChatComposerFileMentionMenu.vue';
import ChatComposerSkillMenu from './ChatComposerSkillMenu.vue';
import { findActiveFileMention, type ActiveComposerMention } from '../shared/chat/composer-mentions';
import { filterFileSearchItems } from '../shared/chat/file-search';
import { filterComposerSkills, findActiveSkillSlash, type ActiveSkillSlash } from '../shared/chat/composer-skills';
import { BrowserAudioRecorder, isBrowserAudioRecordingSupported } from '../shared/audio/browser-audio-recorder';
import { transcribeRecordedAudio } from '../shared/audio/apple-speech-transcription';
import { MicrophoneIcon } from '../shared/icons/app-icons';
import ChatComposerWaveform from '../shared/chat/ChatComposerWaveform.vue';

const props = defineProps<{
  contextUsage?: AgentContextUsage;
  disabled: boolean;
  files?: AgentFileSearchItem[];
  goalMode?: boolean;
  isSending: boolean;
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  models?: CodexModelOption[];
  placeholder: string;
  planMode?: boolean;
  selectedModelId?: string | null;
  selectedReasoningEffort?: ReasoningEffort | null;
  skillCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  skills?: CodexSkillSummary[];
}>();

const emit = defineEmits<{
  send: [prompt: string];
  steer: [prompt: string];
  attach: [];
  interrupt: [];
  'update:goalMode': [enabled: boolean];
  'update:modelId': [modelId: string];
  'update:planMode': [enabled: boolean];
  'update:reasoningEffort': [reasoningEffort: ReasoningEffort];
}>();

const prompt = ref('');
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const caretPosition = ref(0);
const fileMenuOpen = ref(false);
const activeFileIndex = ref(0);
const skillMenuOpen = ref(false);
const activeSkillIndex = ref(0);
const recorder = ref<BrowserAudioRecorder | null>(null);
const isRecording = ref(false);
const isTranscribing = ref(false);
const voiceError = ref<string | null>(null);

const hasPrompt = computed(() => Boolean(prompt.value.trim()));
const canSend = computed(() => Boolean(hasPrompt.value && !props.disabled));
const canInterrupt = computed(() => Boolean(props.isSending && !hasPrompt.value && !props.disabled));
const sendButtonLoading = computed(() => canInterrupt.value);
const sendButtonDisabled = computed(() => !canSend.value && !canInterrupt.value);
const sendButtonLabel = computed(() => (props.isSending ? 'Queue prompt' : 'Send prompt'));
const voiceSupported = computed(() => isBrowserAudioRecordingSupported());
const voiceButtonDisabled = computed(() => (
  isTranscribing.value ||
  (props.disabled && !props.isSending) ||
  !voiceSupported.value ||
  !window.codexClaw?.transcribeAppleSpeech
));
const voiceButtonLabel = computed(() => (isRecording.value ? 'Stop recording' : 'Record voice prompt'));
const voiceButtonTitle = computed(() => {
  if (voiceError.value) {
    return voiceError.value;
  }

  if (!voiceSupported.value) {
    return 'Audio recording is not available.';
  }

  if (!window.codexClaw?.transcribeAppleSpeech) {
    return 'Apple speech transcription is not available.';
  }

  if (isTranscribing.value) {
    return 'Transcribing...';
  }

  return voiceButtonLabel.value;
});
const activeModes = computed(() => [
  ...(props.planMode ? ['Plan'] : []),
  ...(props.goalMode ? ['Goal'] : []),
]);
const activeFileMention = computed<ActiveComposerMention | null>(() => findActiveFileMention(prompt.value, caretPosition.value));
const visibleFiles = computed(() => {
  const mention = activeFileMention.value;
  if (!mention?.query.trim()) {
    return [];
  }

  return filterFileSearchItems(props.files ?? [], mention.query, 5);
});
const fileMenuShowsHint = computed(() => (
  activeFileMention.value !== null &&
  !activeFileMention.value.query.trim() &&
  (props.files ?? []).length > 0
));
const fileMenuVisible = computed(() => (
  fileMenuOpen.value &&
  activeFileMention.value !== null &&
  (props.files ?? []).length > 0 &&
  !(props.disabled && !props.isSending)
));
const activeSkillSlash = computed<ActiveSkillSlash | null>(() => findActiveSkillSlash(prompt.value, caretPosition.value));
const visibleSkills = computed(() => filterComposerSkills(props.skills ?? [], activeSkillSlash.value?.query ?? ''));
const skillMenuVisible = computed(() => (
  skillMenuOpen.value &&
  activeSkillSlash.value !== null &&
  (props.skills ?? []).length > 0 &&
  !(props.disabled && !props.isSending)
));

watch([visibleSkills, activeSkillSlash], () => {
  activeSkillIndex.value = 0;
});

watch([visibleFiles, activeFileMention], () => {
  activeFileIndex.value = 0;
});

function submitPrompt(): void {
  submitWithIntent('send');
}

function handleSendButtonClick(): void {
  if (canInterrupt.value) {
    emit('interrupt');
    return;
  }

  submitPrompt();
}

function submitSteer(): void {
  submitWithIntent('steer');
}

function submitWithIntent(intent: 'send' | 'steer'): void {
  const trimmed = prompt.value.trim();
  if (!canSend.value) {
    return;
  }

  prompt.value = '';
  closeComposerMenus();
  if (intent === 'send') {
    emit('send', trimmed);
  } else {
    emit('steer', trimmed);
  }
  void nextTick(resizeTextarea);
}

async function toggleRecording(): Promise<void> {
  voiceError.value = null;
  if (isRecording.value) {
    await stopRecording();
    return;
  }

  await startRecording();
}

async function startRecording(): Promise<void> {
  if (voiceButtonDisabled.value) {
    return;
  }

  try {
    const nextRecorder = new BrowserAudioRecorder();
    await nextRecorder.start();
    recorder.value = nextRecorder;
    isRecording.value = true;
  } catch (error) {
    recorder.value?.release();
    recorder.value = null;
    voiceError.value = error instanceof Error ? error.message : String(error);
  }
}

async function stopRecording(): Promise<void> {
  const activeRecorder = recorder.value;
  if (!activeRecorder) {
    return;
  }

  isRecording.value = false;
  isTranscribing.value = true;
  recorder.value = null;

  try {
    const recording = await activeRecorder.stop();
    const result = await transcribeRecordedAudio(recording);
    if (result.error) {
      voiceError.value = result.error;
      return;
    }

    insertTranscript(result.text);
  } catch (error) {
    voiceError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isTranscribing.value = false;
  }
}

function insertTranscript(text: string): void {
  const transcript = text.trim();
  if (!transcript) {
    return;
  }

  const textarea = textareaEl.value;
  const start = textarea?.selectionStart ?? caretPosition.value;
  const end = textarea?.selectionEnd ?? caretPosition.value;
  const before = prompt.value.slice(0, start);
  const after = prompt.value.slice(end);
  const prefix = before && !/\s$/.test(before) ? ' ' : '';
  const suffix = after && !/^\s/.test(after) ? ' ' : '';
  const insertion = `${prefix}${transcript}${suffix}`;
  const nextCaret = before.length + insertion.length;
  prompt.value = `${before}${insertion}${after}`;
  caretPosition.value = nextCaret;
  closeComposerMenus();
  void nextTick(() => {
    textareaEl.value?.focus();
    textareaEl.value?.setSelectionRange(nextCaret, nextCaret);
    resizeTextarea();
  });
}

function handleTextareaKeydown(event: KeyboardEvent): void {
  if (fileMenuVisible.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = visibleFiles.value.length;
      if (count > 0) {
        activeFileIndex.value = (activeFileIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeComposerMenus();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && visibleFiles.value.length > 0) {
      event.preventDefault();
      const file = visibleFiles.value[activeFileIndex.value];
      if (file) {
        selectFile(file);
      }
      return;
    }
  }

  if (skillMenuVisible.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = visibleSkills.value.length;
      if (count > 0) {
        activeSkillIndex.value = (activeSkillIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeComposerMenus();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && visibleSkills.value.length > 0) {
      event.preventDefault();
      const skill = visibleSkills.value[activeSkillIndex.value];
      if (skill) {
        selectSkill(skill);
      }
      return;
    }
  }

  if (event.key === 'Tab' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    emit('update:planMode', !props.planMode);
    return;
  }

  if (event.key !== 'Enter') {
    return;
  }

  if (event.shiftKey) {
    resizeTextareaSoon();
    return;
  }

  event.preventDefault();
  if (event.metaKey && !event.ctrlKey && !event.altKey) {
    submitSteer();
    return;
  }

  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    submitPrompt();
  }
}

function handleTextareaInput(): void {
  updateCaretPosition();
  resizeTextarea();
  syncComposerMenus();
}

function selectFile(file: AgentFileSearchItem): void {
  const mention = activeFileMention.value;
  const textarea = textareaEl.value;
  if (!mention || !textarea) {
    return;
  }

  const nextText = `${prompt.value.slice(0, mention.start)}${file.path} ${prompt.value.slice(mention.end)}`;
  const nextCaret = mention.start + file.path.length + 1;
  prompt.value = nextText;
  caretPosition.value = nextCaret;
  closeComposerMenus();
  void nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(nextCaret, nextCaret);
    resizeTextarea();
  });
}

function selectSkill(skill: CodexSkillSummary): void {
  const slash = activeSkillSlash.value;
  const textarea = textareaEl.value;
  if (!slash || !textarea) {
    return;
  }

  const nextText = `${prompt.value.slice(0, slash.start)}/${skill.name} ${prompt.value.slice(slash.end)}`;
  const nextCaret = slash.start + skill.name.length + 2;
  prompt.value = nextText;
  caretPosition.value = nextCaret;
  closeComposerMenus();
  void nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(nextCaret, nextCaret);
    resizeTextarea();
  });
}

function updateCaretPosition(): void {
  const textarea = textareaEl.value;
  caretPosition.value = textarea?.selectionEnd ?? prompt.value.length;
  syncComposerMenus();
}

function closeComposerMenusSoon(): void {
  window.setTimeout(closeComposerMenus, 120);
}

function closeComposerMenus(): void {
  fileMenuOpen.value = false;
  skillMenuOpen.value = false;
}

function syncComposerMenus(): void {
  if (activeFileMention.value !== null) {
    fileMenuOpen.value = true;
    skillMenuOpen.value = false;
    return;
  }

  if (activeSkillSlash.value !== null) {
    skillMenuOpen.value = true;
    fileMenuOpen.value = false;
    return;
  }

  closeComposerMenus();
}

function resizeTextarea(): void {
  const textarea = textareaEl.value;
  if (!textarea) {
    return;
  }

  textarea.style.height = '0px';
  textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
}

function resizeTextareaSoon(): void {
  void nextTick(resizeTextarea);
}
</script>

<style scoped>
.chat-composer {
  --chat-composer-button-size: 36px;
  --chat-composer-input-max-height: 160px;
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.chat-composer:focus-within {
  box-shadow: 0 0 var(--space-6) var(--space-2) var(--color-surface-low), var(--shadow-md);
}

.chat-composer--disabled {
  opacity: 0.62;
}

.chat-composer__input {
  flex: 1 1 auto;
  min-width: 0;
  max-height: var(--chat-composer-input-max-height);
  padding: var(--space-4) 0;
  border: 0;
  outline: 0;
  resize: none;
  overflow-y: auto;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  line-height: var(--line-height-24);
}

.chat-composer__input::placeholder {
  color: var(--color-text-muted);
}

.chat-composer__audio-field {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 28px;
  padding: 0 var(--space-2);
}

.chat-composer__audio-status {
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-20);
}

.chat-composer__meta {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex: 0 0 auto;
}

.chat-composer__modes {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.chat-composer__mode {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-full);
  background: var(--color-surface-base);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.chat-composer__voice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--chat-composer-button-size);
  height: var(--chat-composer-button-size);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.chat-composer__voice:hover:not(:disabled),
.chat-composer__voice--recording {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.chat-composer__voice:disabled {
  cursor: default;
  opacity: 0.42;
}

.chat-composer__voice svg {
  width: 20px;
  height: 20px;
  stroke-width: 1.8;
}

@media (max-width: 720px) {
  .chat-composer {
    border-radius: var(--radius-2xl);
  }
}
</style>
