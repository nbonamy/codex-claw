<template>
  <section
    class="settings-view"
    :aria-label="$t('surface.settingsView.settings')"
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
          :daemon-status="daemonStatus"
          :daemon-status-error="daemonStatusError"
          :settings="generalSettings"
          :source-folder="sourceFolder"
          :set-daemon-enabled="setDaemonEnabled"
          :restart-app="restartApp"
          :update-settings="updateSettings"
        />
        <SettingsCodexPanel
          v-else-if="activeTab === 'codex'"
          :choose-codex-binary="chooseCodexBinary"
          :launch-chat-gpt-app="launchChatGptApp"
          :settings="generalSettings"
          :set-codex-resource-sharing="setCodexResourceSharing"
          :codex-resource-sharing-blocked="codexResourceSharingBlocked"
          :update-settings="updateSettings"
        />
        <SettingsClaudeCodePanel
          v-else-if="activeTab === 'claude-code'"
          :settings="generalSettings"
          :update-settings="updateSettings"
        />
        <SettingsAppearancePanel
          v-else-if="activeTab === 'appearance'"
          :settings="settings"
          :update-settings="updateSettings"
        />
        <SettingsAppshotsPanel
          v-else-if="activeTab === 'appshots' && clawHostCapabilities.appshots"
          :settings="generalSettings.appshots"
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
          @open-authorization="openWorkProviderAuthorization"
        />
        <SettingsPluginsPanel
          v-else-if="activeTab === 'plugins'"
          :settings="generalSettings?.plugins"
          :update-settings="updateSettings"
          :get-plugin-status="getPluginStatus"
        />
        <SettingsConnectionsPanel
          v-else-if="activeTab === 'connections'"
          :connections="remoteConnections"
          :settings="generalSettings"
          :update-settings="updateSettings"
          :teams="teams"
          :list-source-folders="listSourceFolders"
          :list-ssh-hosts="listSshHosts"
          :add-ssh-connection="addSshConnection"
          :check-remote-connection="checkRemoteConnection"
          :update-remote-connection="updateRemoteConnection"
          :remove-remote-connection="removeRemoteConnection"
          :get-device-pairing-status="getDevicePairingStatus"
          :enable-device-pairing="enableDevicePairing"
          :disable-device-pairing="disableDevicePairing"
          :start-device-pairing="startDevicePairing"
          :check-device-pairing="checkDevicePairing"
          :list-paired-devices="listPairedDevices"
          :revoke-paired-device="revokePairedDevice"
        />
      </div>
    </main>
  </section>
</template>

<script setup lang="ts">
import type { AddSshConnectionInput, AppGeneralSettings, AppPluginStatus, AppThemeSettings, ClawdDaemonStatus, DevicePairingSession, DevicePairingStatus, PairedDevice, RemoteConnection, SetCodexResourceSharingInput, SourceFolderListing, SourceFolderListInput, SourceFolderState, SshHostCandidate, Team, UpdateRemoteConnectionInput, UpdateSettingsInput, WorkBacklogState, WorkIntegrationConnection, WorkProviderAuthorization, WorkProviderKind } from '@codex-claw/core/contracts';
import { defaultGeneralSettings, defaultSourceFolderState } from '@codex-claw/core/settings';
import SettingsAppearancePanel from './SettingsAppearancePanel.vue';
import SettingsAppshotsPanel from './SettingsAppshotsPanel.vue';
import SettingsClaudeCodePanel from './SettingsClaudeCodePanel.vue';
import SettingsCodexPanel from './SettingsCodexPanel.vue';
import SettingsConnectionsPanel from './SettingsConnectionsPanel.vue';
import SettingsGeneralPanel from './SettingsGeneralPanel.vue';
import SettingsIntegrationsPanel from './SettingsIntegrationsPanel.vue';
import SettingsPluginsPanel from './SettingsPluginsPanel.vue';
import SettingsSidebar from './SettingsSidebar.vue';
import type { SettingsTab } from './settings-tabs';
import { clawHostCapabilities } from '../platform-api';

withDefaults(defineProps<{
  activeTab?: SettingsTab;
  settings: AppThemeSettings;
  generalSettings?: AppGeneralSettings;
  sourceFolder?: SourceFolderState;
  daemonStatus?: ClawdDaemonStatus | null;
  daemonStatusError?: string | null;
  chooseCodexBinary?: () => Promise<string | null>;
  chooseSourceFolder?: () => Promise<string | null>;
  launchChatGptApp?: () => Promise<void>;
  workBacklogConnections?: WorkIntegrationConnection[];
  workBacklogError?: string | null;
  workBacklogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  workProviderSettings?: WorkBacklogState['providerSettings'];
  workProviderAuthorization?: WorkProviderAuthorization | null;
  remoteConnections?: RemoteConnection[];
  teams?: Team[];
  listSourceFolders?: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  listSshHosts?: () => Promise<SshHostCandidate[]>;
  addSshConnection?: (input: AddSshConnectionInput) => Promise<void>;
  checkRemoteConnection?: (connectionId: string) => Promise<void>;
  updateRemoteConnection?: (connectionId: string, input: UpdateRemoteConnectionInput) => Promise<void>;
  removeRemoteConnection?: (connectionId: string) => Promise<void>;
  getDevicePairingStatus?: () => Promise<DevicePairingStatus>;
  enableDevicePairing?: () => Promise<DevicePairingStatus>;
  disableDevicePairing?: () => Promise<DevicePairingStatus>;
  startDevicePairing?: () => Promise<DevicePairingSession>;
  checkDevicePairing?: (session: DevicePairingSession) => Promise<boolean>;
  listPairedDevices?: (environmentId: string) => Promise<PairedDevice[]>;
  revokePairedDevice?: (environmentId: string, clientId: string) => Promise<void>;
  completeWorkProviderConnection?: (provider: WorkProviderKind) => Promise<void>;
  connectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  disconnectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  openWorkProviderAuthorization?: (provider: WorkProviderKind) => Promise<void>;
  setDaemonEnabled?: (enabled: boolean) => Promise<void>;
  setCodexResourceSharing?: (input: SetCodexResourceSharingInput) => Promise<void>;
  codexResourceSharingBlocked?: boolean;
  restartApp?: () => Promise<void>;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
  getPluginStatus?: () => Promise<AppPluginStatus>;
}>(), {
  activeTab: 'general',
  workBacklogConnections: () => [],
  workBacklogError: null,
  workBacklogStatus: 'notLoaded',
  workProviderSettings: () => ({}),
  workProviderAuthorization: null,
  remoteConnections: () => [],
  teams: () => [],
  listSourceFolders: async () => ({ path: '', parentPath: null, entries: [] }),
  listSshHosts: async () => [],
  addSshConnection: async () => undefined,
  checkRemoteConnection: async () => undefined,
  updateRemoteConnection: async () => undefined,
  removeRemoteConnection: async () => undefined,
  getDevicePairingStatus: async () => ({ status: 'disabled' as const }),
  enableDevicePairing: async () => ({ status: 'disabled' as const }),
  disableDevicePairing: async () => ({ status: 'disabled' as const }),
  startDevicePairing: async () => ({ pairingCode: '', environmentId: '', expiresAt: '' }),
  checkDevicePairing: async () => false,
  listPairedDevices: async () => [],
  revokePairedDevice: async () => undefined,
  generalSettings: () => ({ ...defaultGeneralSettings }),
  sourceFolder: () => ({ ...defaultSourceFolderState }),
  daemonStatus: null,
  daemonStatusError: null,
  chooseCodexBinary: async () => null,
  chooseSourceFolder: async () => null,
  completeWorkProviderConnection: async () => undefined,
  connectWorkProvider: async () => undefined,
  disconnectWorkProvider: async () => undefined,
  openWorkProviderAuthorization: async () => undefined,
  setDaemonEnabled: async () => undefined,
  setCodexResourceSharing: async () => undefined,
  codexResourceSharingBlocked: false,
  restartApp: async () => undefined,
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
  width: calc(100% - var(--team-rail-width));
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
