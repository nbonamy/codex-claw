<template>
  <SettingsPanelFrame :title="$t('surface.instructionSettings.git')" title-id="settings-git-title">
    <div class="settings-instructions__fields">
      <label v-for="field in fields" :key="field" class="settings-instructions__field">
        <span class="settings-instructions__title">{{ $t(`surface.instructionSettings.${field}`) }}</span>
        <span class="settings-instructions__description">{{ $t(`surface.instructionSettings.${field}Description`) }}</span>
        <el-input v-model="draft[field]" type="textarea" :rows="6" :placeholder="$t(`surface.instructionSettings.${field}Placeholder`)" :aria-label="$t(`surface.instructionSettings.${field}`)" @input="schedule({ ...draft })" />
      </label>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useDebouncedSave } from '../shared/use-debounced-save';
import type { AppGeneralSettings, UpdateSettingsInput } from '@codex-claw/core/contracts';
import SettingsPanelFrame from './SettingsPanelFrame.vue';

const props = defineProps<{
  settings: AppGeneralSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();
type Field = 'commitMessageInstructions' | 'pullRequestInstructions';
const fields: Field[] = ['commitMessageInstructions', 'pullRequestInstructions'];
const draft = reactive({ commitMessageInstructions: '', pullRequestInstructions: '' });
const persisted = reactive({ ...draft });
const { schedule, error } = useDebouncedSave(async (general: typeof draft) => {
  if (!props.updateSettings) throw new Error('Settings client unavailable.');
  await props.updateSettings({ general });
  Object.assign(persisted, general);
});
watch(() => [props.settings.commitMessageInstructions, props.settings.pullRequestInstructions], () => {
  for (const field of Object.keys(draft) as Field[]) {
    if (draft[field] === persisted[field]) draft[field] = props.settings[field];
    persisted[field] = props.settings[field];
  }
}, { immediate: true });
</script>

<style scoped>
.settings-instructions__fields { display: flex; flex-direction: column; gap: var(--space-32); }
.settings-instructions__field { display: flex; flex-direction: column; gap: var(--space-6); color: var(--color-text); }
.settings-instructions__title { font-size: var(--font-size-16); font-weight: var(--font-weight-medium); }
.settings-instructions__description { color: var(--color-text-muted); font-size: var(--font-size-13); line-height: var(--line-height-20); margin-bottom: var(--space-6); }
.settings-instructions__field :deep(.el-textarea__inner) { border-radius: var(--radius-lg); font-size: var(--font-size-13); padding: var(--space-8) var(--space-10); }
</style>
