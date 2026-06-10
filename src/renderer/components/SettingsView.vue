<template>
  <section
    class="settings-view"
    aria-label="Settings"
  >
    <div class="settings-view__header" />
    
    <SettingsSidebar
      :active-tab="activeTab"
      class="settings-view__sidebar"
      @select="selectTab"
    />

    <main class="settings-view__content">
      <div class="settings-view__panel">
        <SettingsGeneralPanel
          v-if="activeTab === 'general'"
          :choose-source-folder="chooseSourceFolder"
          :settings="generalSettings"
          :source-folder="sourceFolder"
          :update-settings="updateSettings"
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
    </main>
  </section>
</template>

<script setup lang="ts">
import type { AppGeneralSettings, AppThemeSettings, SourceFolderState, UpdateSettingsInput, WorkBacklogState, WorkIntegrationConnection, WorkProviderAuthorization, WorkProviderKind } from '../../shared/contracts';
import { defaultGeneralSettings, defaultSourceFolderState } from '../../shared/settings';
import SettingsAppearancePanel from './SettingsAppearancePanel.vue';
import SettingsGeneralPanel from './SettingsGeneralPanel.vue';
import SettingsIntegrationsPanel from './SettingsIntegrationsPanel.vue';
import SettingsSidebar from './SettingsSidebar.vue';
import type { SettingsTab } from './settings-tabs';

withDefaults(defineProps<{
  activeTab?: SettingsTab;
  settings: AppThemeSettings;
  generalSettings?: AppGeneralSettings;
  sourceFolder?: SourceFolderState;
  chooseSourceFolder?: () => Promise<string | null>;
  workBacklogConnections?: WorkIntegrationConnection[];
  workBacklogError?: string | null;
  workBacklogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  workProviderSettings?: WorkBacklogState['providerSettings'];
  workProviderAuthorization?: WorkProviderAuthorization | null;
  completeWorkProviderConnection?: (provider: WorkProviderKind) => Promise<void>;
  connectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  disconnectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>(), {
  activeTab: 'general',
  workBacklogConnections: () => [],
  workBacklogError: null,
  workBacklogStatus: 'notLoaded',
  workProviderSettings: () => ({}),
  workProviderAuthorization: null,
  generalSettings: () => ({ ...defaultGeneralSettings }),
  sourceFolder: () => ({ ...defaultSourceFolderState }),
  chooseSourceFolder: async () => null,
  completeWorkProviderConnection: async () => undefined,
  connectWorkProvider: async () => undefined,
  disconnectWorkProvider: async () => undefined,
});

const emit = defineEmits<{
  selectTab: [tab: SettingsTab];
}>();

function selectTab(tab: SettingsTab): void {
  emit('selectTab', tab);
}
</script>

<style scoped>
.settings-view {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  overflow: hidden;
  background: var(--color-shell-main);
}

.settings-view__header {
  position: absolute;
  top: 0;
  left: var(--team-rail-width);
  height: var(--workbench-appbar-height);
  width: 100%;
  background: var(--color-shell-main);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

.settings-view__sidebar {
  min-height: 0;
  user-select: none;
}

.settings-view__content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--space-32) 0;
}

.settings-view__panel {
  max-width: 720px;
  margin: 0 auto;
}
</style>
