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
      title="Remote backends"
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
          <el-button
            size="small"
            :loading="checkingConnectionId === connection.id"
            @click="checkConnection(connection.id)"
          >
            Check
          </el-button>
          <el-button
            size="small"
            @click="removeConnection(connection.id)"
          >
            Remove
          </el-button>
        </div>
      </article>
    </SettingsSection>

    <el-dialog
      v-model="addDialogVisible"
      title="Add SSH connection"
      width="680"
      append-to-body
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
        <template v-else>
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
        </template>
      </div>
    </el-dialog>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AddSshConnectionInput, RemoteConnection, SshHostCandidate } from '@codex-claw/shared/contracts';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsSection from './SettingsSection.vue';

const props = withDefaults(defineProps<{
  addSshConnection?: (input: AddSshConnectionInput) => Promise<void>;
  checkRemoteConnection?: (connectionId: string) => Promise<void>;
  connections?: RemoteConnection[];
  listSshHosts?: () => Promise<SshHostCandidate[]>;
  removeRemoteConnection?: (connectionId: string) => Promise<void>;
}>(), {
  addSshConnection: async () => undefined,
  checkRemoteConnection: async () => undefined,
  connections: () => [],
  listSshHosts: async () => [],
  removeRemoteConnection: async () => undefined,
});

const addDialogVisible = ref(false);
const hosts = ref<SshHostCandidate[]>([]);
const loadingHosts = ref(false);
const hostError = ref<string | null>(null);
const addingHost = ref<string | null>(null);
const checkingConnectionId = ref<string | null>(null);

const connections = computed(() => props.connections);
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
  checkingConnectionId.value = connectionId;
  try {
    await props.checkRemoteConnection(connectionId);
  } finally {
    checkingConnectionId.value = null;
  }
}

async function removeConnection(connectionId: string): Promise<void> {
  await props.removeRemoteConnection(connectionId);
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
  padding: var(--space-8) 0;
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
  padding: var(--space-10) 0;
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
  gap: var(--space-2);
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
  gap: var(--space-6);
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
}
</style>
