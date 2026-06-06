<template>
  <form
    class="chat-composer"
    :class="{ 'chat-composer--disabled': disabled && !isSending }"
    aria-label="Prompt composer"
    @submit.prevent="submitPrompt"
  >
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

    <textarea
      ref="textareaEl"
      v-model="prompt"
      class="chat-composer__input"
      :placeholder="placeholder"
      aria-label="Prompt"
      rows="1"
      :disabled="disabled && !isSending"
      @blur="closeSkillMenuSoon"
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
      <ChatComposerSendButton
        :disabled="!canSend"
        :loading="sendButtonLoading"
        :label="sendButtonLabel"
        cancel-label="Codex is working"
        @click="submitPrompt"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { AgentContextUsage, CodexModelOption, CodexSkillSummary, ReasoningEffort } from '../../shared/contracts';
import ChatComposerSendButton from '../shared/chat/ChatComposerSendButton.vue';
import ChatComposerActionMenu from './ChatComposerActionMenu.vue';
import ChatContextUsageIndicator from './ChatContextUsageIndicator.vue';
import ChatModelReasoningSelector from './ChatModelReasoningSelector.vue';
import ChatComposerSkillMenu from './ChatComposerSkillMenu.vue';
import { filterComposerSkills, findActiveSkillSlash, type ActiveSkillSlash } from '../shared/chat/composer-skills';

const props = defineProps<{
  contextUsage?: AgentContextUsage;
  disabled: boolean;
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
  'update:goalMode': [enabled: boolean];
  'update:modelId': [modelId: string];
  'update:planMode': [enabled: boolean];
  'update:reasoningEffort': [reasoningEffort: ReasoningEffort];
}>();

const prompt = ref('');
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const caretPosition = ref(0);
const skillMenuOpen = ref(false);
const activeSkillIndex = ref(0);

const hasPrompt = computed(() => Boolean(prompt.value.trim()));
const canSend = computed(() => Boolean(hasPrompt.value && !props.disabled));
const sendButtonLoading = computed(() => props.isSending && !hasPrompt.value);
const sendButtonLabel = computed(() => (props.isSending ? 'Queue prompt' : 'Send prompt'));
const activeModes = computed(() => [
  ...(props.planMode ? ['Plan'] : []),
  ...(props.goalMode ? ['Goal'] : []),
]);
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

function submitPrompt(): void {
  submitWithIntent('send');
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
  closeSkillMenu();
  if (intent === 'send') {
    emit('send', trimmed);
  } else {
    emit('steer', trimmed);
  }
  void nextTick(resizeTextarea);
}

function handleTextareaKeydown(event: KeyboardEvent): void {
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
      closeSkillMenu();
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
  skillMenuOpen.value = activeSkillSlash.value !== null;
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
  closeSkillMenu();
  void nextTick(() => {
    textarea.focus();
    textarea.setSelectionRange(nextCaret, nextCaret);
    resizeTextarea();
  });
}

function updateCaretPosition(): void {
  const textarea = textareaEl.value;
  caretPosition.value = textarea?.selectionEnd ?? prompt.value.length;
  if (activeSkillSlash.value !== null) {
    skillMenuOpen.value = true;
  }
}

function closeSkillMenuSoon(): void {
  window.setTimeout(closeSkillMenu, 120);
}

function closeSkillMenu(): void {
  skillMenuOpen.value = false;
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
  min-height: 60px;
  padding: var(--space-6);
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

@media (max-width: 720px) {
  .chat-composer {
    border-radius: var(--radius-2xl);
  }
}
</style>
