<template>
  <div class="chat-model-selector">
    <button
      v-if="models.length === 0"
      class="chat-model-selector__button"
      type="button"
      aria-label="Model and reasoning"
      disabled
    >
      <span class="chat-model-selector__label">{{ selectorLabel }}</span>
      <ChevronDown class="chat-model-selector__chevron" aria-hidden="true" />
    </button>
    <el-dropdown
      v-else
      placement="top-end"
      trigger="click"
      :disabled="controlDisabled"
      :teleported="false"
      @command="onCommand"
    >
      <button
        class="chat-model-selector__button"
        type="button"
        aria-label="Model and reasoning"
        aria-haspopup="listbox"
        :disabled="controlDisabled"
      >
        <BoltIcon v-if="selectedModel" class="chat-model-selector__leading-icon" aria-hidden="true" />
        <span class="chat-model-selector__label">{{ selectorLabel }}</span>
        <ChevronDown class="chat-model-selector__chevron" aria-hidden="true" />
      </button>

      <template #dropdown>
        <el-dropdown-menu class="chat-model-selector__menu" role="listbox">
          <li class="chat-model-selector__section-label" role="presentation">Model</li>
          <el-dropdown-item
            v-for="model in models"
            :key="model.id"
            class="chat-model-selector__option"
            :class="{ 'chat-model-selector__option--selected': model.id === selectedModel?.id }"
            :command="{ kind: 'model', value: model.id }"
            role="option"
            :aria-selected="model.id === selectedModel?.id"
          >
            <span class="chat-model-selector__option-label">{{ model.displayName }}</span>
            <CheckIcon
              v-if="model.id === selectedModel?.id"
              class="chat-model-selector__check"
              aria-hidden="true"
            />
          </el-dropdown-item>
          <li class="chat-model-selector__divider" role="presentation"></li>
          <li class="chat-model-selector__section-label" role="presentation">Reasoning</li>
          <el-dropdown-item
            v-for="effort in reasoningEfforts"
            :key="effort.reasoningEffort"
            class="chat-model-selector__option"
            :class="{ 'chat-model-selector__option--selected': effort.reasoningEffort === effectiveReasoningEffort }"
            :command="{ kind: 'reasoning', value: effort.reasoningEffort }"
            role="option"
            :aria-selected="effort.reasoningEffort === effectiveReasoningEffort"
          >
            <span class="chat-model-selector__option-label">{{ effortLabel(effort.reasoningEffort) }}</span>
            <CheckIcon
              v-if="effort.reasoningEffort === effectiveReasoningEffort"
              class="chat-model-selector__check"
              aria-hidden="true"
            />
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CodexModelOption, ReasoningEffort } from '../../shared/contracts';
import { BoltIcon, CheckIcon, ChevronDown } from '../shared/icons/app-icons';

type SelectorCommand = {
  kind: 'model' | 'reasoning';
  value: string;
};

const props = withDefaults(defineProps<{
  disabled?: boolean;
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  modelId?: string | null;
  models?: CodexModelOption[];
  reasoningEffort?: ReasoningEffort | null;
}>(), {
  disabled: false,
  modelCatalogStatus: 'notLoaded',
  modelId: null,
  models: () => [],
  reasoningEffort: null,
});

const emit = defineEmits<{
  'update:modelId': [modelId: string];
  'update:reasoningEffort': [reasoningEffort: ReasoningEffort];
}>();

const selectedModel = computed(() => (
  props.models.find((model) => model.id === props.modelId) ??
  props.models.find((model) => model.isDefault) ??
  props.models[0] ??
  null
));

const reasoningEfforts = computed(() => selectedModel.value?.supportedReasoningEfforts ?? []);

const effectiveReasoningEffort = computed(() => (
  props.reasoningEffort ??
  selectedModel.value?.defaultReasoningEffort ??
  reasoningEfforts.value[0]?.reasoningEffort ??
  null
));

const controlDisabled = computed(() => props.disabled);

const selectorLabel = computed(() => {
  if (!selectedModel.value) {
    return modelFallbackLabel.value;
  }

  const effort = effectiveReasoningEffort.value ? effortLabel(effectiveReasoningEffort.value) : effortFallbackLabel.value;
  return `${compactModelLabel(selectedModel.value.displayName)} ${effort}`;
});

const modelFallbackLabel = computed(() => {
  if (props.modelCatalogStatus === 'loading') {
    return 'Loading models';
  }

  if (props.modelCatalogStatus === 'error') {
    return 'Models unavailable';
  }

  return 'Model';
});

const effortFallbackLabel = computed(() => {
  if (props.modelCatalogStatus === 'loading') {
    return 'Loading';
  }

  return 'Reasoning';
});

function effortLabel(effort: ReasoningEffort): string {
  const labels: Record<string, string> = {
    xhigh: 'Extra High',
  };
  const normalized = effort.trim().toLowerCase();
  if (labels[normalized]) {
    return labels[normalized];
  }

  return effort
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function compactModelLabel(modelLabel: string): string {
  return modelLabel.replace(/^gpt[-\s]*/i, '').trim() || modelLabel;
}

function onCommand(command: unknown): void {
  if (!isSelectorCommand(command)) {
    return;
  }

  if (command.kind === 'model') {
    emit('update:modelId', command.value);
  } else {
    emit('update:reasoningEffort', command.value);
  }
}

function isSelectorCommand(command: unknown): command is SelectorCommand {
  if (!command || typeof command !== 'object') {
    return false;
  }

  const candidate = command as Record<string, unknown>;
  return (candidate.kind === 'model' || candidate.kind === 'reasoning') && typeof candidate.value === 'string';
}
</script>

<style scoped>
.chat-model-selector {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.chat-model-selector__button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 184px;
  min-height: var(--chat-composer-button-size, 36px);
  padding: 0 var(--space-4);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  font-family: var(--font-family-base);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
  cursor: pointer;
}

.chat-model-selector__button:hover:not(:disabled),
.chat-model-selector__button[aria-expanded="true"] {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.chat-model-selector__button:disabled {
  cursor: default;
}

.chat-model-selector__label,
.chat-model-selector__option-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-model-selector__leading-icon,
.chat-model-selector__chevron {
  flex: 0 0 auto;
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.chat-model-selector__menu {
  min-width: 220px;
  max-width: 260px;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-menu);
  color: var(--color-text);
}

.chat-model-selector__option {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--space-16);
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.chat-model-selector__option:hover,
.chat-model-selector__option:focus {
  background: var(--color-surface-low);
}

.chat-model-selector__option--selected {
  font-weight: var(--font-weight-semibold);
}

.chat-model-selector__section-label {
  padding: var(--space-3) var(--space-4) var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.chat-model-selector__divider {
  height: 1px;
  margin: var(--space-2) var(--space-4);
  background: var(--color-border);
}

.chat-model-selector__option-icon,
.chat-model-selector__check {
  flex: 0 0 auto;
  width: var(--icon-md);
  height: var(--icon-md);
}

.chat-model-selector__check {
  margin-left: auto;
  color: var(--color-text-muted);
}

@media (max-width: 720px) {
  .chat-model-selector {
    display: none;
  }
}
</style>
