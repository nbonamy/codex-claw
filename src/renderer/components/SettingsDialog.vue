<template>
  <el-dialog
    v-model="dialogVisible"
    align-center
    class="claw-dialog settings-dialog"
    width="680px"
  >
    <template #header>
      <div class="claw-dialog__header">
        <div>
          <h2>Settings</h2>
        </div>
      </div>
    </template>

    <div class="settings-dialog__layout">
      <SettingsDialogSidebar
        :active-tab="activeTab"
        @select="activeTab = $event"
      />
      <SettingsGeneralPanel
        v-if="activeTab === 'general'"
      />
      <SettingsIntegrationsPanel
        v-else-if="activeTab === 'integrations'"
        :authorization="workProviderAuthorization"
        :connections="workBacklogConnections"
        :error="workBacklogError"
        :provider-settings="workProviderSettings"
        :status="workBacklogStatus"
        :update-settings="updateSettings"
        @complete="completeWorkProviderConnection"
        @connect="connectWorkProvider"
        @disconnect="disconnectWorkProvider"
      />
      <SettingsAppearancePanel
        v-else
        :settings="settings"
        :update-settings="updateSettings"
      />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AppThemeSettings, UpdateSettingsInput, WorkBacklogState, WorkIntegrationConnection, WorkProviderAuthorization, WorkProviderKind } from '../../shared/contracts';
import SettingsAppearancePanel from './SettingsAppearancePanel.vue';
import SettingsDialogSidebar from './SettingsDialogSidebar.vue';
import SettingsGeneralPanel from './SettingsGeneralPanel.vue';
import SettingsIntegrationsPanel from './SettingsIntegrationsPanel.vue';
import type { SettingsTab } from './settings-dialog-tabs';

const props = withDefaults(defineProps<{
  settings: AppThemeSettings;
  workBacklogConnections?: WorkIntegrationConnection[];
  workBacklogError?: string | null;
  workBacklogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  workProviderSettings?: WorkBacklogState['providerSettings'];
  workProviderAuthorization?: WorkProviderAuthorization | null;
  completeWorkProviderConnection?: (provider: WorkProviderKind) => Promise<void>;
  connectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  disconnectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
  visible: boolean;
}>(), {
  workBacklogConnections: () => [],
  workBacklogError: null,
  workBacklogStatus: 'notLoaded',
  workProviderSettings: () => ({}),
  workProviderAuthorization: null,
  completeWorkProviderConnection: async () => undefined,
  connectWorkProvider: async () => undefined,
  disconnectWorkProvider: async () => undefined,
});

const emit = defineEmits<{
  'update:visible': [visible: boolean];
}>();

const activeTab = ref<SettingsTab>('appearance');

const dialogVisible = computed({
  get: () => props.visible,
  set: (visible) => emit('update:visible', visible),
});
</script>

<style>

.settings-dialog {
  .el-dialog__header {
    padding: var(--space-4) var(--space-16);
  }
}

</style>

<style scoped>

.settings-dialog__layout {
  display: grid;
  min-height: 360px;
  grid-template-columns: 168px minmax(0, 1fr);
  overflow: hidden;
}
</style>
