<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsClaudeCodePanel.claudeCode')"
    title-id="settings-claude-code-title"
  >
    <SettingsSection>
      <SettingsRow
        as="label"
        :title="$t('surface.settingsClaudeCodePanel.enableClaudeCodeExperimental')"
        :description="$t('surface.settingsClaudeCodePanel.showClaudeCodeAsAnExperimentalOptionWhenCreatingAgents')"
      >
        <template #control>
          <el-switch
            :model-value="settings.claudeCodeEnabled"
            :aria-label="$t('surface.settingsClaudeCodePanel.enableClaudeCodeExperimental')"
            @update:model-value="updateClaudeCodeEnabled"
          />
        </template>
      </SettingsRow>
    </SettingsSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import type { AppGeneralSettings, UpdateSettingsInput } from '@codex-claw/core/contracts';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

const props = defineProps<{
  settings: AppGeneralSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();

function updateClaudeCodeEnabled(value: boolean | string | number): void {
  void props.updateSettings?.({
    general: {
      claudeCodeEnabled: value === true,
    },
  });
}
</script>
