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

    <ChatComposerSlashMenu
      v-if="slashMenuVisible"
      :active-index="activeSlashIndex"
      :visible-commands="visibleSlashCommands"
      :visible-skills="visibleSlashSkills"
      @select-command="selectCommand"
      @select-skill="selectSlashSkill"
    />

    <ChatComposerActionMenu
      :disabled="disabled"
      :approval-preset="approvalPreset"
      :plan-mode="planMode"
      :show-approval-menu="effectiveBackendCapabilities.approvals && Boolean(approvalPreset)"
      :show-plan-mode="effectiveBackendCapabilities.planMode !== 'unsupported'"
      @attach="$emit('attach')"
      @select-approval-preset="$emit('selectApprovalPreset', $event)"
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
          :key="mode.label"
          class="chat-composer__mode"
          :class="[`chat-composer__mode__${mode.tint}`]"
        >
          <component :is="mode.icon" class="chat-composer__mode__icon" />
          <CircleXIcon class="chat-composer__mode__remove" @click="removeActiveMode(mode.mode)" />
          {{ mode.label }}
        </span>
      </div>
      <ChatContextUsageIndicator :context-usage="contextUsage" />
      <ChatModelReasoningSelector
        v-if="effectiveBackendCapabilities.models"
        :disabled="disabled || isSending"
        :models="models"
        :model-catalog-status="modelCatalogStatus"
        :model-id="selectedModelId"
        :reasoning-effort="selectedReasoningEffort"
        :show-reasoning="effectiveBackendCapabilities.reasoningEffort"
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
import type { AgentContextUsage, AgentFileSearchItem, ApprovalPreset, BackendCapabilities, BackendCommandSummary, BackendModelOption, BackendSkillSummary, ReasoningEffort } from '../../shared/contracts';
import { defaultBackendCapabilities } from '../../shared/backend-capabilities';
import ChatComposerSendButton from '../shared/chat/ChatComposerSendButton.vue';
import ChatComposerActionMenu from './ChatComposerActionMenu.vue';
import ChatContextUsageIndicator from './ChatContextUsageIndicator.vue';
import ChatModelReasoningSelector from './ChatModelReasoningSelector.vue';
import ChatComposerFileMentionMenu from './ChatComposerFileMentionMenu.vue';
import ChatComposerSkillMenu from './ChatComposerSkillMenu.vue';
import ChatComposerSlashMenu from './ChatComposerSlashMenu.vue';
import { findActiveFileMention, type ActiveComposerMention } from '../shared/chat/composer-mentions';
import { filterFileSearchItems } from '../shared/chat/file-search';
import { filterComposerCommands, findActiveCommandSlash, type ActiveCommandSlash } from '../shared/chat/composer-commands';
import { filterComposerSkills, findActiveSkillTrigger, type ActiveSkillSlash } from '../shared/chat/composer-skills';
import { BrowserAudioRecorder, isBrowserAudioRecordingSupported } from '../shared/audio/browser-audio-recorder';
import { transcribeRecordedAudio } from '../shared/audio/apple-speech-transcription';
import { CircleXIcon, ListDetailsIcon, MicrophoneIcon } from '../shared/icons/app-icons';
import ChatComposerWaveform from '../shared/chat/ChatComposerWaveform.vue';

const props = defineProps<{
  contextUsage?: AgentContextUsage;
  disabled: boolean;
  draft?: string;
  draftRevision?: number;
  files?: AgentFileSearchItem[];
  backendCapabilities?: BackendCapabilities;
  commands?: BackendCommandSummary[];
  isSending: boolean;
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  models?: BackendModelOption[];
  placeholder: string;
  approvalPreset?: ApprovalPreset | null;
  planMode?: boolean;
  selectedModelId?: string | null;
  selectedReasoningEffort?: ReasoningEffort | null;
  skillCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  skills?: BackendSkillSummary[];
}>();

const emit = defineEmits<{
  send: [prompt: string];
  steer: [prompt: string];
  attach: [];
  interrupt: [];
  'update:modelId': [modelId: string];
  selectApprovalPreset: [preset: ApprovalPreset];
  'update:planMode': [enabled: boolean];
  'update:reasoningEffort': [reasoningEffort: ReasoningEffort];
}>();

const CHAT_COMPOSER_INPUT_MAX_HEIGHT_PX = 88;

const prompt = ref('');
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const caretPosition = ref(0);
const fileMenuOpen = ref(false);
const activeFileIndex = ref(0);
const skillMenuOpen = ref(false);
const activeSkillIndex = ref(0);
const slashMenuOpen = ref(false);
const activeSlashIndex = ref(0);
const recorder = ref<BrowserAudioRecorder | null>(null);
const isRecording = ref(false);
const isTranscribing = ref(false);
const voiceError = ref<string | null>(null);
const effectiveBackendCapabilities = computed(() => props.backendCapabilities ?? defaultBackendCapabilities('codex'));

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
type ActiveComposerMode = {
  icon: typeof ListDetailsIcon;
  label: string;
  mode: 'plan';
  tint: 'info';
};

const activeModes = computed<ActiveComposerMode[]>(() => {
  const modes: ActiveComposerMode[] = [];
  if (effectiveBackendCapabilities.value.planMode !== 'unsupported' && props.planMode) {
    modes.push({ mode: 'plan', label: 'Plan', tint: 'info', icon: ListDetailsIcon });
  }

  return modes;
});
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
const activeSkillSlash = computed<ActiveSkillSlash | null>(() => findActiveSkillTrigger(prompt.value, caretPosition.value, '$'));
const visibleSkills = computed(() => filterComposerSkills(props.skills ?? [], activeSkillSlash.value?.query ?? ''));
const skillMenuVisible = computed(() => (
  skillMenuOpen.value &&
  effectiveBackendCapabilities.value.skills &&
  activeSkillSlash.value !== null &&
  (props.skills ?? []).length > 0 &&
  !(props.disabled && !props.isSending)
));
const activeCommandSlash = computed<ActiveCommandSlash | null>(() => findActiveCommandSlash(prompt.value, caretPosition.value));
const visibleSlashCommands = computed(() => filterComposerCommands(props.commands ?? [], activeCommandSlash.value?.query ?? ''));
const visibleSlashSkills = computed(() => (
  effectiveBackendCapabilities.value.skills
    ? filterComposerSkills(props.skills ?? [], activeCommandSlash.value?.query ?? '')
    : []
));
const slashItemCount = computed(() => visibleSlashCommands.value.length + visibleSlashSkills.value.length);
const slashMenuVisible = computed(() => (
  slashMenuOpen.value &&
  activeCommandSlash.value !== null &&
  slashItemCount.value > 0 &&
  !(props.disabled && !props.isSending)
));

watch([visibleSkills, activeSkillSlash], () => {
  activeSkillIndex.value = 0;
});

watch([visibleSlashCommands, visibleSlashSkills, activeCommandSlash], () => {
  activeSlashIndex.value = 0;
});

watch([visibleFiles, activeFileMention], () => {
  activeFileIndex.value = 0;
});

watch(() => props.draftRevision, () => {
  setComposerText(props.draft ?? '');
}, { immediate: props.draftRevision !== undefined });

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

function setComposerText(value: string): void {
  prompt.value = value;
  const nextCaret = value.length;
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

  if (slashMenuVisible.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = slashItemCount.value;
      if (count > 0) {
        activeSlashIndex.value = (activeSlashIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeComposerMenus();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      selectActiveSlashItem();
      return;
    }
  }

  if (event.key === 'Tab' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    if (effectiveBackendCapabilities.value.planMode !== 'unsupported') {
      emit('update:planMode', !props.planMode);
    }
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

function removeActiveMode(mode: ActiveComposerMode['mode']): void {
  if (mode === 'plan') {
    emit('update:planMode', false);
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

function selectSkill(skill: BackendSkillSummary): void {
  selectSkillForMention(skill, activeSkillSlash.value, '$');
}

function selectSlashSkill(skill: BackendSkillSummary): void {
  selectSkillForMention(skill, activeCommandSlash.value, '/');
}

function selectSkillForMention(skill: BackendSkillSummary, mention: ActiveSkillSlash | ActiveCommandSlash | null, trigger: '$' | '/'): void {
  const textarea = textareaEl.value;
  if (!mention || !textarea) {
    return;
  }

  const nextText = `${prompt.value.slice(0, mention.start)}${trigger}${skill.name} ${prompt.value.slice(mention.end)}`;
  const nextCaret = mention.start + skill.name.length + 2;
  prompt.value = nextText;
  caretPosition.value = nextCaret;
  closeComposerMenus();
  void nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(nextCaret, nextCaret);
    resizeTextarea();
  });
}

function selectCommand(command: BackendCommandSummary): void {
  const mention = activeCommandSlash.value;
  const textarea = textareaEl.value;
  if (!mention || !textarea) {
    return;
  }

  const slashCommand = `/${command.slashName ?? command.name}`;
  if (command.submitOnSelect) {
    prompt.value = '';
    caretPosition.value = 0;
    closeComposerMenus();
    emit('send', slashCommand);
    void nextTick(resizeTextarea);
    return;
  }

  const insertion = slashCommand;
  const nextText = `${prompt.value.slice(0, mention.start)}${insertion} ${prompt.value.slice(mention.end)}`;
  const nextCaret = mention.start + insertion.length + 1;
  prompt.value = nextText;
  caretPosition.value = nextCaret;
  closeComposerMenus();
  void nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(nextCaret, nextCaret);
    resizeTextarea();
  });
}

function selectActiveSlashItem(): void {
  const command = visibleSlashCommands.value[activeSlashIndex.value];
  if (command) {
    selectCommand(command);
    return;
  }

  const skillIndex = activeSlashIndex.value - visibleSlashCommands.value.length;
  const skill = visibleSlashSkills.value[skillIndex];
  if (skill) {
    selectSlashSkill(skill);
  }
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
  slashMenuOpen.value = false;
}

function syncComposerMenus(): void {
  if (activeFileMention.value !== null) {
    fileMenuOpen.value = true;
    skillMenuOpen.value = false;
    slashMenuOpen.value = false;
    return;
  }

  if (activeSkillSlash.value !== null) {
    skillMenuOpen.value = true;
    fileMenuOpen.value = false;
    slashMenuOpen.value = false;
    return;
  }

  if (activeCommandSlash.value !== null) {
    slashMenuOpen.value = true;
    fileMenuOpen.value = false;
    skillMenuOpen.value = false;
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
  textarea.style.height = `${Math.min(textarea.scrollHeight, CHAT_COMPOSER_INPUT_MAX_HEIGHT_PX)}px`;
}

function resizeTextareaSoon(): void {
  void nextTick(resizeTextarea);
}
</script>

<style scoped>
.chat-composer {
  --chat-composer-button-size: 36px;
  --chat-composer-button-size-small: 28px;
  --chat-composer-input-max-height: calc(var(--line-height-24) + var(--line-height-24) + var(--line-height-24) + var(--space-4) + var(--space-4));
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
  font-size: var(--font-size-15);
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
  gap: var(--space-2);
  min-height: 24px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-full);
  background: var(--color-surface-base);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.chat-composer__mode svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.chat-composer__mode .chat-composer__mode__remove {
  display: none;
}

.chat-composer__mode:hover .chat-composer__mode__icon {
  display: none;
}

.chat-composer__mode:hover .chat-composer__mode__remove {
  cursor: pointer;
  display: inline;
}

.chat-composer__mode.chat-composer__mode__info {
  background-color: var(--color-secondary-container);
  color: var(--color-on-secondary-container);
}

.chat-composer__voice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--chat-composer-button-size-small);
  height: var(--chat-composer-button-size-small);
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
