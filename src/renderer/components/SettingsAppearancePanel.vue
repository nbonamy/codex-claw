<template>
  <section
    class="settings-appearance-panel"
    aria-labelledby="settings-appearance-title"
  >
    <h3 id="settings-appearance-title">Appearance</h3>
    <div class="settings-appearance-panel__rows">
      <label class="settings-appearance-panel__row">
        <span>Mode</span>
        <el-segmented
          :model-value="settings.mode"
          :options="modeOptions"
          @update:model-value="updateMode"
        />
      </label>
      <label class="settings-appearance-panel__row">
        <span>Theme</span>
        <el-select
          :model-value="settings.id"
          aria-label="Theme"
          @update:model-value="updateThemeId"
        >
          <el-option
            v-for="theme in visibleThemes"
            :key="theme.id"
            :label="theme.name"
            :value="theme.id"
          />
        </el-select>
      </label>
      <!-- <label class="settings-appearance-panel__row">
        <span>UI font size</span>
        <el-input-number
          :model-value="settings.uiFontSize"
          :min="11"
          :max="22"
          @update:model-value="updateNumericTheme('uiFontSize', $event)"
        />
      </label> -->
      <label class="settings-appearance-panel__row">
        <span>Chat font size</span>
        <el-input-number
          :model-value="settings.chatFontSize"
          :min="11"
          :max="22"
          @update:model-value="updateNumericTheme('chatFontSize', $event)"
        />
      </label>
      <label class="settings-appearance-panel__row">
        <span>Code font size</span>
        <el-input-number
          :model-value="settings.codeFontSize"
          :min="11"
          :max="22"
          @update:model-value="updateNumericTheme('codeFontSize', $event)"
        />
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AppThemeSettings, UpdateSettingsInput } from '../../shared/contracts';
import { appThemes, themeIdForAppearance } from '../theme/themes';

const props = defineProps<{
  settings: AppThemeSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();

const themes = appThemes;
const visibleThemes = computed(() => {
  if (props.settings.mode === 'system') {
    return themes;
  }

  return themes.filter((theme) => theme.appearance === props.settings.mode);
});
const modeOptions = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
];

function updateTheme(theme: Partial<AppThemeSettings>): void {
  void props.updateSettings?.({ theme });
}

function updateMode(mode: string | number): void {
  if (mode !== 'dark' && mode !== 'light' && mode !== 'system') {
    return;
  }

  if (mode === 'system') {
    updateTheme({ mode });
    return;
  }

  const currentTheme = themes.find((theme) => theme.id === props.settings.id);
  const nextThemeId = currentTheme?.appearance === mode
    ? currentTheme.id
    : themeIdForAppearance(props.settings.id, mode);

  updateTheme({
    mode,
    ...(nextThemeId ? { id: nextThemeId } : {}),
  });
}

function updateThemeId(id: string): void {
  updateTheme({ id });
}

function updateNumericTheme(key: 'chatFontSize' | 'codeFontSize' | 'uiFontSize', value: number | null): void {
  if (typeof value !== 'number') {
    return;
  }

  updateTheme({ [key]: value });
}
</script>

<style scoped>
.settings-appearance-panel {
  min-width: 0;
  padding: var(--space-8) var(--space-12);
  background: var(--color-surface-lowest);
}

.settings-appearance-panel h3 {
  margin: 0 0 var(--space-8);
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.settings-appearance-panel__rows {
  display: grid;
}

.settings-appearance-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
  min-height: 58px;
  border-bottom: 1px solid var(--color-border);
}

.settings-appearance-panel__row:last-child {
  border-bottom: 0;
}

.settings-appearance-panel__row > span {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
}

.settings-appearance-panel__row :deep(.el-select) {
  width: 220px;
}
</style>
