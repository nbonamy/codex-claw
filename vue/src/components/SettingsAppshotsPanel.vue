<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsAppshotsPanel.appshots')"
    title-id="settings-appshots-title"
  >
    <div class="settings-appshots-panel__intro">
      <span class="settings-appshots-panel__icon" aria-hidden="true">
        <ScreenshotIcon />
      </span>
      <span>
        <strong>{{ $t('surface.settingsAppshotsPanel.takeAnAppshotToShowCodexYourFrontmostWindow') }}</strong>
        <span>{{ $t('surface.settingsAppshotsPanel.appshotsCaptureTheWindowImageAndAttachItToYourActiveAgen') }}</span>
      </span>
    </div>

    <FormSection>
      <FormRow
        :title="$t('surface.settingsAppshotsPanel.hotkey')"
        :description="hotkeyDescription"
      >
        <template #control>
          <el-select
            :model-value="settings.hotkey"
            :aria-label="$t('surface.settingsAppshotsPanel.appshotHotkey')"
            class="settings-appshots-panel__select"
            @update:model-value="updateHotkey"
          >
            <el-option label="⌘ + ⌘" value="command" />
            <el-option label="⌥ + ⌥" value="option" />
            <el-option label="⇧ + ⇧" value="shift" />
            <el-option :label="$t('surface.settingsAppshotsPanel.none')" value="none" />
          </el-select>
        </template>
      </FormRow>
      <FormRow
        :title="$t('surface.settingsAppshotsPanel.appshotDestination')"
        :description="$t('surface.settingsAppshotsPanel.chooseWhereAppshotsGoWhenYouUseTheHotkey')"
      >
        <template #control>
          <el-select
            model-value="active-agent"
            :aria-label="$t('surface.settingsAppshotsPanel.appshotDestination')"
            class="settings-appshots-panel__select"
          >
            <el-option :label="$t('surface.settingsAppshotsPanel.activeAgent')" value="active-agent" />
          </el-select>
        </template>
      </FormRow>
      <FormRow
        as="label"
        :title="$t('surface.settingsAppshotsPanel.playSoundEffect')"
        :description="$t('surface.settingsAppshotsPanel.confirmWhenTheFrontmostWindowHasBeenCaptured')"
      >
        <template #control>
          <el-switch
            :model-value="settings.playSound"
            :aria-label="$t('surface.settingsAppshotsPanel.playAppshotSoundEffect')"
            @update:model-value="updatePlaySound"
          />
        </template>
      </FormRow>
    </FormSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { computed } from 'vue';
import type { AppshotHotkey, AppshotSettings, UpdateSettingsInput } from '@workspace/core/contracts';
import { ScreenshotIcon } from '../shared/icons/app-icons';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import FormRow from '../shared/form/FormRow.vue';
import FormSection from '../shared/form/FormSection.vue';

const props = defineProps<{
  settings: AppshotSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();

const hotkeyDescription = computed(() => {
  if (props.settings.hotkey === 'none') return translate('surface.settingsAppshotsPanel.appshotsAreDisabled');
  const label = props.settings.hotkey === 'command' ? translate('surface.settingsAppshotsPanel.command') : props.settings.hotkey === 'option' ? translate('surface.settingsAppshotsPanel.option') : translate('surface.settingsAppshotsPanel.shift');
  return `Press both ${label} keys simultaneously`;
});

function updateHotkey(hotkey: AppshotHotkey): void {
  void props.updateSettings?.({ general: { appshots: { ...props.settings, hotkey } } });
}

function updatePlaySound(playSound: boolean): void {
  void props.updateSettings?.({ general: { appshots: { ...props.settings, playSound } } });
}
</script>

<style scoped>
.settings-appshots-panel__intro {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  margin-bottom: var(--space-16);
  padding: var(--space-12);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
}

.settings-appshots-panel__intro > span:last-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.settings-appshots-panel__intro strong {
  color: var(--color-text);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-22);
}

.settings-appshots-panel__intro > span:last-child > span {
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
}

.settings-appshots-panel__icon {
  width: var(--space-32);
  height: var(--space-32);
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
}

.settings-appshots-panel__icon svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

.settings-appshots-panel__select {
  width: 170px;
}
</style>
