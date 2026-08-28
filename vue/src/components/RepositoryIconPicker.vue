<template>
  <el-popover
    v-model:visible="open"
    placement="right-start"
    trigger="click"
    :width="256"
    :show-arrow="false"
    popper-class="repository-icon-picker-popper"
  >
    <template #reference>
      <button
        class="repository-icon-picker__trigger"
        type="button"
        :aria-label="`Change icon for ${label}`"
        :aria-expanded="open"
      >
        <span v-if="modelValue" class="repository-icon-picker__emoji" aria-hidden="true">{{ modelValue }}</span>
        <FolderIcon v-else aria-hidden="true" />
      </button>
    </template>

    <div class="repository-icon-picker" aria-label="Repository icon picker">
      <header class="repository-icon-picker__header">
        <strong>Repository icon</strong>
        <button
          v-if="modelValue"
          type="button"
          @click="selectIcon(undefined)"
        >
          Reset
        </button>
      </header>
      <div class="repository-icon-picker__grid">
        <button
          v-for="preset in iconPresets"
          :key="preset"
          class="repository-icon-picker__preset"
          type="button"
          :aria-label="`Use ${preset} for ${label}`"
          :aria-pressed="modelValue === preset"
          @click="selectIcon(preset)"
        >
          {{ preset }}
        </button>
      </div>
      <div class="repository-icon-picker__custom">
        <input
          v-model="customIcon"
          type="text"
          aria-label="Custom repository icon"
          placeholder="Paste an emoji"
          @keydown.enter.prevent="applyCustomIcon"
        />
        <button
          type="button"
          aria-label="Use custom repository icon"
          :disabled="!customIcon.trim()"
          @click="applyCustomIcon"
        >
          <CheckIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CheckIcon, FolderIcon } from '../shared/icons/app-icons';

const iconPresets = [
  '🦞', '🤖', '🧠', '💻', '🛠️', '⚙️', '🚀', '🧪',
  '📦', '🌐', '📱', '🎨', '🎵', '📡', '🔒', '⚡',
];

const props = defineProps<{
  label: string;
  modelValue?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [icon: string | undefined];
}>();

const open = ref(false);
const customIcon = ref('');

function selectIcon(icon: string | undefined): void {
  emit('update:modelValue', icon);
  customIcon.value = '';
  open.value = false;
}

function applyCustomIcon(): void {
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(customIcon.value.trim())];
  if (segments.length !== 1) return;
  selectIcon(segments[0]?.segment);
}
</script>

<style scoped>
.repository-icon-picker {
  min-width: 0;
  display: grid;
  gap: var(--space-10);
}

.repository-icon-picker__trigger {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.repository-icon-picker__trigger:hover,
.repository-icon-picker__trigger[aria-expanded="true"] {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.repository-icon-picker__trigger svg {
  width: 20px;
  height: 20px;
  stroke-width: 1.9;
}

.repository-icon-picker__emoji {
  font-size: 18px;
  line-height: 1;
}

.repository-icon-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
}

.repository-icon-picker__header strong {
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
}

.repository-icon-picker__header button {
  padding: 0;
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  font-size: var(--font-size-12);
  cursor: pointer;
}

.repository-icon-picker__grid {
  display: grid;
  grid-template-columns: repeat(8, 24px);
  justify-content: space-between;
  gap: var(--space-2);
}

.repository-icon-picker__preset {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  font-size: var(--font-size-16);
  cursor: pointer;
}

.repository-icon-picker__preset:hover,
.repository-icon-picker__preset[aria-pressed="true"] {
  border-color: var(--color-border);
  background: var(--color-surface-base);
}

.repository-icon-picker__custom {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-lowest);
}

.repository-icon-picker__custom:focus-within {
  border-color: var(--color-primary);
}

.repository-icon-picker__custom input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 var(--space-8);
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
}

.repository-icon-picker__custom button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
}

.repository-icon-picker__custom button:disabled {
  color: var(--color-text-muted);
  opacity: 0.45;
}

.repository-icon-picker__custom svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}
</style>
