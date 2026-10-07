<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsClaudeCodePanel.claudeCode')"
    title-id="settings-claude-code-title"
  >
    <template #banner>
      <SettingsIntro :title="$t('surface.settingsClaudeCodePanel.introTitle')" :description="$t('surface.settingsClaudeCodePanel.introDescription')">
        <BackendIcon backend="claude" class="settings-intro-logo" />
      </SettingsIntro>
    </template>
    <SettingsEngineConnectionRow :authentication="authentication" :connected="connected" :enabled="enabled" :set-enabled="setEnabled" :busy="busy" :error="error" @connect="emit('connect')" @disconnect="emit('disconnect')">
      <SettingsEngineSetupRow :home="home" @customize="emit('customize')" />
    </SettingsEngineConnectionRow>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsIntro from './SettingsIntro.vue';
import BackendIcon from './BackendIcon.vue';
import SettingsEngineConnectionRow from './SettingsEngineConnectionRow.vue';
import SettingsEngineSetupRow from './SettingsEngineSetupRow.vue';
import type { ProviderAuthentication, ProviderHomeSettings } from '@workspace/core/contracts/provider-setup';

withDefaults(defineProps<{ connected?: boolean; enabled?: boolean; authentication?: ProviderAuthentication; home?: ProviderHomeSettings; setEnabled?: (enabled: boolean) => unknown; busy?: boolean; error?: string | null }>(), { enabled: true });
const emit = defineEmits<{ connect: []; disconnect: []; customize: [] }>();
</script>
