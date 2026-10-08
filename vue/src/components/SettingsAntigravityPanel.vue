<template>
  <SettingsPanelFrame :title="$t('antigravity.name')" title-id="settings-antigravity-title">
    <SettingsEngineConnectionRow backend="antigravity" :title="$t('antigravity.name')" :authentication="authentication" :connected="connected" :enabled="enabled" :set-enabled="setEnabled" :busy="busy" :pending="pending" :error="error" @connect="emit('connect')" @disconnect="emit('disconnect')" @cancel="emit('cancel')">
      <SettingsEngineSetupRow :home="home" @customize="emit('customize')" />
    </SettingsEngineConnectionRow>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import type { ProviderAuthentication, ProviderHomeSettings } from '@workspace/core/contracts/provider-setup';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsEngineConnectionRow from './SettingsEngineConnectionRow.vue';
import SettingsEngineSetupRow from './SettingsEngineSetupRow.vue';
defineProps<{ connected?: boolean; enabled?: boolean; authentication?: ProviderAuthentication; home?: ProviderHomeSettings; setEnabled?: (enabled: boolean) => unknown; busy?: boolean; pending?: boolean; error?: string | null }>();
const emit = defineEmits<{ connect: []; disconnect: []; customize: []; cancel: [] }>();
</script>
