<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsAppearancePanel.appearance')"
    title-id="settings-appearance-title"
  >
    <SettingsSection
      :title="$t('surface.settingsAppearancePanel.color')"
      title-id="settings-appearance-color-title"
    >
      <SettingsRow
        as="label"
        :title="$t('surface.settingsAppearancePanel.mode')"
        :description="$t('surface.settingsAppearancePanel.chooseHowCodexClawFollowsLightAndDarkAppearances')"
      >
        <template #control>
          <el-segmented
            :model-value="settings.mode"
            :options="modeOptions"
            @update:model-value="updateMode"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        as="label"
        :title="$t('surface.settingsAppearancePanel.theme')"
        :description="$t('surface.settingsAppearancePanel.selectTheColorPaletteUsedAcrossTheApp')"
      >
        <template #control>
          <el-select
            class="settings-appearance-panel__theme-select"
            :model-value="settings.id"
            :aria-label="$t('surface.settingsAppearancePanel.theme')"
            @update:model-value="updateThemeId"
          >
            <el-option
              v-for="theme in visibleThemes"
              :key="theme.id"
              :label="theme.name"
              :value="theme.id"
            />
          </el-select>
        </template>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      :title="$t('surface.settingsAppearancePanel.typography')"
      title-id="settings-appearance-typography-title"
    >
      <SettingsRow
        as="label"
        :title="$t('surface.settingsAppearancePanel.chatFontSize')"
        :description="$t('surface.settingsAppearancePanel.adjustConversationTextSize')"
      >
        <template #control>
          <el-input-number
            :model-value="settings.chatFontSize"
            :min="11"
            :max="22"
            @update:model-value="updateNumericTheme('chatFontSize', $event)"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        as="label"
        :title="$t('surface.settingsAppearancePanel.codeFontSize')"
        :description="$t('surface.settingsAppearancePanel.adjustMonospaceTextSizeInCodeAndCommandOutput')"
      >
        <template #control>
          <el-input-number
            :model-value="settings.codeFontSize"
            :min="11"
            :max="22"
            @update:model-value="updateNumericTheme('codeFontSize', $event)"
          />
        </template>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      :title="$t('surface.settingsAppearancePanel.diffPreview')"
      title-id="settings-appearance-diff-preview-title"
    >
      <GitDiffPreviewPanel
        class="settings-appearance-panel__diff-preview"
        :diff="diffPreview"
      />
    </SettingsSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { computed } from 'vue';
import type { AppThemeSettings, UpdateSettingsInput } from '@codex-claw/core/contracts';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';
import GitDiffPreviewPanel from './GitDiffPreviewPanel.vue';
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
  { label: translate('surface.settingsAppearancePanel.light'), value: 'light' },
  { label: translate('surface.settingsAppearancePanel.dark'), value: 'dark' },
  { label: translate('surface.settingsAppearancePanel.system'), value: 'system' },
];
const diffPreview = [
  'diff --git a/src/theme.ts b/src/theme.ts',
  '--- a/src/theme.ts',
  '+++ b/src/theme.ts',
  '@@ -29,5 +29,5 @@',
  ' export const appearance = {',
  "-  accent: 'blue',",
  "+  accent: 'claw',",
  "   mode: 'system',",
  ' };',
].join('\n');

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
.settings-appearance-panel__theme-select {
  width: 220px;
}

.settings-appearance-panel__diff-preview {
  max-height: 280px;
}
</style>
