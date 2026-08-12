<template>
  <SettingsPanelFrame
    title="Claude Code"
    title-id="settings-claude-code-title"
  >
    <SettingsSection>
      <SettingsRow
        as="label"
        title="Enable Claude Code (experimental)"
        description="Show Claude Code as an experimental option when creating agents."
      >
        <template #control>
          <el-switch
            :model-value="settings.claudeCodeEnabled"
            aria-label="Enable Claude Code (experimental)"
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
