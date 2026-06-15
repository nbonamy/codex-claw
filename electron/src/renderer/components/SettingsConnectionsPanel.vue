<template>
  <SettingsPanelFrame
    title="Connections"
    title-id="settings-connections-title"
  >
    <template #actions>
      <el-button
        size="small"
        type="primary"
        @click="openAddDialog"
      >
        Add
      </el-button>
    </template>

    <SettingsSection
      title="Remote Codex Claw agents"
      title-id="settings-connections-remotes-title"
    >
      <div
        v-if="connections.length === 0"
        class="settings-connections-panel__empty"
      >
        No remote connections
      </div>
      <article
        v-for="connection in connections"
        :key="connection.id"
        class="settings-connections-panel__connection"
      >
        <div class="settings-connections-panel__identity">
          <span
            class="settings-connections-panel__dot"
            :class="`settings-connections-panel__dot--${connection.status}`"
            aria-hidden="true"
          />
          <div>
            <strong>{{ connection.name }}</strong>
            <span>{{ connectionLabel(connection) }}</span>
            <em v-if="connection.detail">{{ connection.detail }}</em>
          </div>
        </div>
        <div class="settings-connections-panel__actions">
          <button
            type="button"
            :aria-label="`Connection settings for ${connection.name}`"
            title="Connection settings"
            @click="openConnectionSettings(connection)"
          >
            <SettingsIcon aria-hidden="true" />
          </button>
          <el-popover
            :visible="openMenuConnectionId === connection.id"
            placement="bottom-end"
            trigger="manual"
            width="180"
            :teleported="true"
            popper-class="claw-popover settings-connections-panel__menu-popover"
            @update:visible="setMenuVisible(connection.id, $event)"
          >
            <template #reference>
              <button
                type="button"
                :aria-label="`${connection.name} actions`"
                @click="setMenuVisible(connection.id, openMenuConnectionId !== connection.id)"
              >
                <DotsVerticalIcon aria-hidden="true" />
              </button>
            </template>
            <AppMenu
              class="app-menu--embedded"
              ariaLabel="Connection actions"
              :items="connectionMenuItems(connection)"
              @click.stop
              @select="selectConnectionMenuItem(connection, $event)"
            />
          </el-popover>
        </div>
      </article>
    </SettingsSection>

    <el-dialog
      v-model="settingsDialogVisible"
      :title="settingsDialogTitle"
      width="520"
      append-to-body
      class="claw-dialog"
    >
      <el-form
        class="settings-connections-panel__settings"
        label-position="top"
      >
        <el-form-item label="Source folder">
          <el-input
            v-model="settingsSourceFolderPath"
            placeholder="~/src"
          />
        </el-form-item>
        <p
          v-if="settingsError"
          class="settings-connections-panel__error"
        >
          {{ settingsError }}
        </p>
      </el-form>
      <template #footer>
        <el-button @click="closeConnectionSettings">
          Cancel
        </el-button>
        <el-button
          type="primary"
          :loading="savingConnectionSettings"
          @click="saveConnectionSettings"
        >
          Save
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="addDialogVisible"
      title="Add SSH connection"
      width="680"
      append-to-body
      class="claw-dialog"
    >
      <div class="settings-connections-panel__dialog">
        <p
          v-if="hostError"
          class="settings-connections-panel__error"
        >
          {{ hostError }}
        </p>
        <div
          v-else-if="loadingHosts"
          class="settings-connections-panel__loading"
        >
          Loading SSH hosts...
        </div>
        <div
          v-else-if="sshHosts.length === 0"
          class="settings-connections-panel__empty"
        >
          No SSH hosts found
        </div>
        <div v-else>
          <article
            v-for="host in sshHosts"
            :key="host.host"
            class="settings-connections-panel__host"
          >
            <div>
              <strong>{{ host.host }}</strong>
              <span>{{ hostCandidateLabel(host) }}</span>
            </div>
            <el-button
              size="small"
              :loading="addingHost === host.host"
              :disabled="addingHost !== null"
              @click="addConnection(host)"
            >
              Connect
            </el-button>
          </article>
        </div>
      </div>
    </el-dialog>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';
import { computed, ref } from 'vue';
import type { AddSshConnectionInput, RemoteConnection, SshHostCandidate, Team, UpdateRemoteConnectionInput } from '@codex-claw/shared/contracts';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import { DotsVerticalIcon, RefreshIcon, SettingsIcon, Trash2Icon } from '../shared/icons/app-icons';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsSection from './SettingsSection.vue';

const props = withDefaults(defineProps<{
  addSshConnection?: (input: AddSshConnectionInput) => Promise<void>;
  checkRemoteConnection?: (connectionId: string) => Promise<void>;
  connections?: RemoteConnection[];
  listSshHosts?: () => Promise<SshHostCandidate[]>;
  teams?: Team[];
  updateRemoteConnection?: (connectionId: string, input: UpdateRemoteConnectionInput) => Promise<void>;
  removeRemoteConnection?: (connectionId: string) => Promise<void>;
}>(), {
  addSshConnection: async () => undefined,
  checkRemoteConnection: async () => undefined,
  connections: () => [],
  listSshHosts: async () => [],
  teams: () => [],
  updateRemoteConnection: async () => undefined,
  removeRemoteConnection: async () => undefined,
});

const addDialogVisible = ref(false);
const settingsDialogVisible = ref(false);
const hosts = ref<SshHostCandidate[]>([]);
const loadingHosts = ref(false);
const hostError = ref<string | null>(null);
const addingHost = ref<string | null>(null);
const checkingConnectionId = ref<string | null>(null);
const openMenuConnectionId = ref<string | null>(null);
const settingsConnection = ref<RemoteConnection | null>(null);
const settingsSourceFolderPath = ref('');
const settingsError = ref<string | null>(null);
const savingConnectionSettings = ref(false);

const connections = computed(() => props.connections);
const settingsDialogTitle = computed(() => (
  settingsConnection.value ? `${settingsConnection.value.name} settings` : 'SSH settings'
));
const sshHosts = computed(() => {
  const connectedHosts = new Set(props.connections.map((connection) => connection.host));
  return hosts.value.filter((host) => !connectedHosts.has(host.host));
});

async function openAddDialog(): Promise<void> {
  addDialogVisible.value = true;
  await loadSshHosts();
}

async function loadSshHosts(): Promise<void> {
  loadingHosts.value = true;
  hostError.value = null;
  try {
    hosts.value = await props.listSshHosts();
  } catch (error) {
    hosts.value = [];
    hostError.value = error instanceof Error ? error.message : String(error);
  } finally {
    loadingHosts.value = false;
  }
}

async function addConnection(host: SshHostCandidate): Promise<void> {
  addingHost.value = host.host;
  hostError.value = null;
  try {
    await props.addSshConnection({
      name: host.host,
      ...host,
    });
    addDialogVisible.value = false;
  } catch (error) {
    hostError.value = error instanceof Error ? error.message : String(error);
  } finally {
    addingHost.value = null;
  }
}

async function checkConnection(connectionId: string): Promise<void> {
  openMenuConnectionId.value = null;
  checkingConnectionId.value = connectionId;
  try {
    await props.checkRemoteConnection(connectionId);
  } finally {
    checkingConnectionId.value = null;
  }
}

function openConnectionSettings(connection: RemoteConnection): void {
  settingsConnection.value = connection;
  settingsSourceFolderPath.value = connection.sourceFolderPath ?? '';
  settingsError.value = null;
  settingsDialogVisible.value = true;
}

function closeConnectionSettings(): void {
  if (savingConnectionSettings.value) {
    return;
  }
  settingsDialogVisible.value = false;
  settingsConnection.value = null;
  settingsError.value = null;
}

async function saveConnectionSettings(): Promise<void> {
  const connection = settingsConnection.value;
  if (!connection) {
    return;
  }

  savingConnectionSettings.value = true;
  settingsError.value = null;
  try {
    await props.updateRemoteConnection(connection.id, {
      sourceFolderPath: settingsSourceFolderPath.value.trim(),
    });
    settingsDialogVisible.value = false;
    settingsConnection.value = null;
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    savingConnectionSettings.value = false;
  }
}

function setMenuVisible(connectionId: string, visible: boolean): void {
  openMenuConnectionId.value = visible ? connectionId : null;
}

function connectionMenuItems(connection: RemoteConnection): AppMenuItem[] {
  return [{
    id: 'check',
    type: 'action',
    label: checkingConnectionId.value === connection.id ? 'Checking...' : 'Check',
    disabled: checkingConnectionId.value === connection.id,
    icon: RefreshIcon,
  }, {
    id: 'delete',
    type: 'action',
    label: 'Delete',
    danger: true,
    icon: Trash2Icon,
  }];
}

function selectConnectionMenuItem(connection: RemoteConnection, itemId: string): void {
  openMenuConnectionId.value = null;
  if (itemId === 'check') {
    void checkConnection(connection.id);
  } else if (itemId === 'delete') {
    void confirmRemoveConnection(connection);
  }
}

async function confirmRemoveConnection(connection: RemoteConnection): Promise<void> {
  const connectedTeams = teamsForConnection(connection.id);
  try {
    await ElMessageBox.confirm(
      connectionDeleteMessage(connection, connectedTeams),
      `Delete ${connection.name}?`,
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Delete',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  await props.removeRemoteConnection(connection.id);
}

function teamsForConnection(connectionId: string): Team[] {
  return props.teams.filter((team) => team.remoteConnectionId === connectionId);
}

function connectionDeleteMessage(connection: RemoteConnection, teams: Team[]): string {
  if (teams.length === 0) {
    return `${connection.name} will be removed.`;
  }

  const teamNames = teams.map((team) => team.name).join(', ');
  const teamLabel = teams.length === 1 ? 'team' : 'teams';
  return `${connection.name} will be removed. This will also delete ${teams.length} connected ${teamLabel}: ${teamNames}. Their agents and messages will be removed from Codex Claw.`;
}

function connectionLabel(connection: RemoteConnection): string {
  const target = hostLabel({
    host: connection.host,
    hostName: connection.hostName,
    user: connection.user,
    port: connection.port,
  });
  return `${target} · ${statusLabel(connection.status)}`;
}

function hostCandidateLabel(host: SshHostCandidate): string {
  return hostLabel(host);
}

function hostLabel(host: Pick<SshHostCandidate, 'host' | 'hostName' | 'port' | 'user'>): string {
  const user = host.user ? `${host.user}@` : '';
  const target = host.hostName || host.host;
  const port = host.port ? `:${host.port}` : '';
  return `${user}${target}${port}`;
}

function statusLabel(status: RemoteConnection['status']): string {
  if (status === 'ready') {
    return 'Ready';
  }
  if (status === 'checking') {
    return 'Checking';
  }
  if (status === 'error') {
    return 'Needs attention';
  }
  return 'Saved';
}
</script>

<style scoped>

.settings-connections-panel__empty,
.settings-connections-panel__loading {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  padding: var(--space-8);
}

.settings-connections-panel__error {
  color: var(--color-error);
  font-size: var(--font-size-13);
  margin: 0;
}

.settings-connections-panel__connection,
.settings-connections-panel__host {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  padding: var(--space-10);
  border-bottom: 1px solid var(--color-border);
}

.settings-connections-panel__connection:last-child,
.settings-connections-panel__host:last-child {
  border-bottom: 0;
}

.settings-connections-panel__identity {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: var(--space-8);
}

.settings-connections-panel__identity div,
.settings-connections-panel__host div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.settings-connections-panel__identity strong,
.settings-connections-panel__host strong {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: 600;
}

.settings-connections-panel__identity span,
.settings-connections-panel__host span,
.settings-connections-panel__identity em {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-style: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-connections-panel__actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.settings-connections-panel__actions button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.settings-connections-panel__actions button:hover,
.settings-connections-panel__actions button:focus-visible {
  color: var(--color-text);
}

.settings-connections-panel__actions svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.settings-connections-panel__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--color-text-muted);
}

.settings-connections-panel__dot--ready {
  background: var(--color-success);
}

.settings-connections-panel__dot--checking {
  background: var(--color-warning);
}

.settings-connections-panel__dot--error {
  background: var(--color-error);
}

.settings-connections-panel__dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-height: 400px;
  overflow: auto;
}

.settings-connections-panel__settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}
</style>
