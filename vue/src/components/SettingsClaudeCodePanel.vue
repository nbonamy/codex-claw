<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsClaudeCodePanel.claudeCode')"
    title-id="settings-claude-code-title"
  >
    <SettingsEngineConnectionRow :connected="connected" :enabled="enabled" :set-enabled="setEnabled" :busy="busy" :error="error" @connect="emit('connect')" />
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsEngineConnectionRow from './SettingsEngineConnectionRow.vue';

withDefaults(defineProps<{ connected?: boolean; enabled?: boolean; setEnabled?: (enabled: boolean) => unknown; busy?: boolean; error?: string | null }>(), { enabled: true });
const emit = defineEmits<{ connect: [] }>();
</script>
