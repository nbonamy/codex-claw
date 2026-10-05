<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsClaudeCodePanel.claudeCode')"
    title-id="settings-claude-code-title"
  >
    <SettingsEngineConnectionRow :authentication="authentication" :connected="connected" :enabled="enabled" :set-enabled="setEnabled" :busy="busy" :error="error" @connect="emit('connect')" @disconnect="emit('disconnect')">
      <SettingsEngineSetupRow :home="home" @customize="emit('customize')" />
    </SettingsEngineConnectionRow>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsEngineConnectionRow from './SettingsEngineConnectionRow.vue';
import SettingsEngineSetupRow from './SettingsEngineSetupRow.vue';
import type { ProviderAuthentication, ProviderHomeSettings } from '@workspace/core/contracts/provider-setup';

withDefaults(defineProps<{ connected?: boolean; enabled?: boolean; authentication?: ProviderAuthentication; home?: ProviderHomeSettings; setEnabled?: (enabled: boolean) => unknown; busy?: boolean; error?: string | null }>(), { enabled: true });
const emit = defineEmits<{ connect: []; disconnect: []; customize: [] }>();
</script>
