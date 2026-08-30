<template>
  <section
    class="automations-view"
    :aria-label="$t('surface.automationsView.automations')"
  >

    <div class="automations-view__header" />

    <main class="automations-view__content">
      <div class="automations-view__panel">
        <SettingsPanelFrame
          :title="$t('surface.automationsView.automations')"
          title-id="automations-title"
        >
          <div
            v-if="!editorVisible && !logAutomation"
            class="automations-view__list-header"
          >
            <div class="automations-view__location-heading">
              <h3>{{ $t('surface.automationsView.automations') }}</h3>
              <ChevronRightIcon aria-hidden="true" />
              <el-select
                v-model="selectedLocationValue"
                class="automations-view__location-select"
                :aria-label="$t('surface.automationsView.automationLocation')"
                size="small"
              >
                <el-option
                  :label="$t('surface.automationsView.local')"
                  value="local"
                />
                <el-option
                  v-for="connection in readyRemoteConnections"
                  :key="connection.id"
                  :label="connection.name"
                  :value="remoteLocationValue(connection.id)"
                />
              </el-select>
            </div>
            <el-button
              v-if="locationAutomations.length > 0"
              type="primary"
              @click="openCreate"
            > {{ $t('surface.automationsView.newAutomation') }} </el-button>
          </div>

          <AutomationEditor
            v-if="editorVisible"
            :key="editorKey"
            :backend-models="backendModels"
            :bench-templates="locationBench"
            :choose-agent-folder="chooseAutomationAgentFolder"
            :connection="locationGithubConnection"
            :items-by-repository="locationWorkItemsByRepository"
            :automation="editingAutomation"
            :mode="editorMode"
            :repositories="locationGithubRepositories"
            :source-repositories="locationSourceRepositories"
            :teams="locationTeams"
            @cancel="closeEditor"
            @load-items="loadGitHubItems"
            @load-repositories="loadGitHubRepositories"
            @submit="saveAutomation"
          />

          <AutomationExecutionLog
            v-else-if="logAutomation"
            :automation="logAutomation"
            :messages="messages"
            :read-conversation-messages="readLocationConversationMessages"
            @clear-history="confirmClearAutomationHistory"
            @close="closeLog"
            @delete-execution="confirmDeleteAutomationExecution"
          />

          <div
            v-else-if="locationStatus === 'loading'"
            class="automations-view__location-state"
          > {{ $t('surface.automationsView.loadingAutomations') }} </div>

          <div
            v-else-if="locationStatus === 'error'"
            class="automations-view__error"
          >
            {{ locationError }}
          </div>

          <AutomationWelcome
            v-else-if="locationAutomations.length === 0"
            @create="openCreate"
          />

          <div
            v-else
            class="automations-view__list"
          >
            <AppDataList
              :aria-label="$t('surface.automationsView.automations')"
              :columns="automationColumns"
              :rows="automationRows"
            >
              <template #cell-automation="{ row }">
                <div class="automations-view__automation-cell">
                  <span
                    class="automations-view__status"
                    :data-enabled="row.enabled"
                  />
                  <div class="automations-view__info">
                    <strong>{{ row.name }}</strong>
                    <span>{{ row.sourceLine }}</span>
                  </div>
                </div>
              </template>

              <template #cell-lastExecution="{ row }">
                <span class="automations-view__meta-cell">{{ row.lastExecution }}</span>
              </template>

              <template #cell-executionCount="{ row }">
                <span class="automations-view__meta-cell">{{ row.executionCount }}</span>
              </template>

              <template #actions="{ row }">
                <div class="automations-view__row-actions">
                  <button
                    type="button"
                    :aria-label="$t('dynamic.automations.run', { automation: row.name })"
                    :disabled="!row.enabled"
                    @click="runAutomation(row.id)"
                  >
                    <PlayerPlayIcon aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    :aria-label="$t('dynamic.automations.viewLogs', { automation: row.name })"
                    @click="openLog(row.id)"
                  >
                    <LogsIcon aria-hidden="true" />
                  </button>
                  <el-popover
                    :visible="openMenuAutomationId === row.id"
                    placement="bottom-end"
                    trigger="manual"
                    width="180"
                    :teleported="true"
                    popper-class="claw-popover automations-view__menu-popover"
                    @update:visible="setMenuVisible(row.id, $event)"
                  >
                    <template #reference>
                      <button
                        type="button"
                        :aria-label="`${row.name} actions`"
                        @click="setMenuVisible(row.id, openMenuAutomationId !== row.id)"
                      >
                        <DotsVerticalIcon aria-hidden="true" />
                      </button>
                    </template>
                    <AppMenu
                      class="app-menu--embedded"
                      :ariaLabel="$t('surface.automationsView.automationActions')"
                      :items="automationMenuItems"
                      @click.stop
                      @select="selectAutomationMenuItem(row.id, $event)"
                    />
                  </el-popover>
                </div>
              </template>
            </AppDataList>

            <div
              v-if="workBacklogStatus === 'error' && workBacklogError"
              class="automations-view__error"
            >
              {{ workBacklogError }}
            </div>
          </div>
        </SettingsPanelFrame>
      </div>
    </main>

    <RemoteFolderPickerDialog
      :initial-path="remoteFolderPickerInitialPath"
      :list-source-folders="listAutomationSourceFolders"
      :remote-connection-id="selectedRemoteConnectionId ?? ''"
      :visible="remoteFolderPickerVisible"
      @close="cancelRemoteFolderPicker"
      @select="selectRemoteFolder"
    />
  </section>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { ElMessageBox } from 'element-plus';
import { computed, onMounted, ref, watch } from 'vue';
import type { AppSnapshot, BackendConversationRef, BackendModelOption, CreateAutomationInput, Automation, AutomationLocation, RemoteConnection, RendererMessage, SourceFolderListing, SourceFolderListInput, SourceRepository, UpdateAutomationInput, WorkItem, WorkProviderKind, WorkRepository } from '@codex-claw/core/contracts';
import { createEmptySnapshot } from '@codex-claw/core/snapshot';
import AppDataList from './AppDataList.vue';
import type { AppDataListColumn, AppDataListRow } from './app-data-list';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import AutomationEditor from './AutomationEditor.vue';
import AutomationExecutionLog from './AutomationExecutionLog.vue';
import AutomationWelcome from './AutomationWelcome.vue';
import RemoteFolderPickerDialog from './RemoteFolderPickerDialog.vue';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import { ChevronRightIcon, DotsVerticalIcon, LogsIcon, PencilIcon, PlayerPlayIcon, Trash2Icon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  backendModels?: BackendModelOption[];
  bench: AppSnapshot['bench'];
  chooseAgentFolder?: () => Promise<string | null>;
  clearAutomationHistory?: (automationId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  createAutomation?: (input: CreateAutomationInput, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  deleteAutomationExecution?: (automationId: string, executionId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  deleteAutomation?: (automationId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  getAutomationSnapshot?: (location?: AutomationLocation) => Promise<AppSnapshot>;
  listSourceFolders?: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  listSourceRepositories?: (remoteConnectionId?: string) => Promise<SourceRepository[]>;
  loadWorkItems?: (provider: WorkProviderKind, repositoryId: string, location?: AutomationLocation) => Promise<WorkItem[] | void>;
  loadWorkRepositories?: (provider: WorkProviderKind, location?: AutomationLocation) => Promise<WorkRepository[] | void>;
  automations: Automation[];
  messages?: RendererMessage[];
  remoteConnections?: RemoteConnection[];
  runAutomation?: (automationId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  readConversationMessages?: (ref: BackendConversationRef, agentId: string, location?: AutomationLocation) => Promise<RendererMessage[]>;
  sourceRepositories?: SourceRepository[];
  teams: AppSnapshot['teams'];
  updateAutomation?: (input: UpdateAutomationInput, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  workBacklog: AppSnapshot['workBacklog'];
  workBacklogError?: string | null;
  workBacklogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  workItemsByRepository?: Record<string, WorkItem[]>;
  workRepositoriesByProvider?: Partial<Record<WorkProviderKind, WorkRepository[]>>;
}>(), {
  backendModels: () => [],
  clearAutomationHistory: async () => undefined,
  chooseAgentFolder: async () => null,
  createAutomation: async () => undefined,
  deleteAutomationExecution: async () => undefined,
  deleteAutomation: async () => undefined,
  getAutomationSnapshot: async () => createEmptySnapshot(),
  listSourceFolders: async () => ({ path: '', parentPath: null, entries: [] }),
  listSourceRepositories: async () => [],
  loadWorkItems: async () => undefined,
  loadWorkRepositories: async () => undefined,
  messages: () => [],
  readConversationMessages: async () => [],
  remoteConnections: () => [],
  runAutomation: async () => undefined,
  sourceRepositories: () => [],
  updateAutomation: async () => undefined,
  workBacklogError: null,
  workBacklogStatus: 'notLoaded',
  workItemsByRepository: () => ({}),
  workRepositoriesByProvider: () => ({}),
});

type EditorMode = 'create' | 'edit';
type LocationStatus = 'idle' | 'loading' | 'error';

const editorMode = ref<EditorMode>('create');
const editingAutomationId = ref<string | null>(null);
const logAutomationId = ref<string | null>(null);
const openMenuAutomationId = ref<string | null>(null);
const selectedLocationValue = ref('local');
const remoteSnapshot = ref<AppSnapshot | null>(null);
const remoteSourceRepositories = ref<SourceRepository[]>([]);
const remoteWorkRepositoriesByProvider = ref<Partial<Record<WorkProviderKind, WorkRepository[]>>>({});
const remoteWorkItemsByRepository = ref<Record<string, WorkItem[]>>({});
const locationStatus = ref<LocationStatus>('idle');
const locationError = ref<string | null>(null);
const remoteFolderPickerVisible = ref(false);
const remoteFolderPickerInitialPath = ref('');
let remoteFolderPickerResolve: ((path: string | null) => void) | null = null;
let locationLoadId = 0;
const emptyLocationSnapshot = createEmptySnapshot();

const editorVisible = computed(() => editorMode.value === 'create' ? creating.value : Boolean(editingAutomation.value));
const creating = ref(false);
const readyRemoteConnections = computed(() => props.remoteConnections.filter((connection) => (
  connection.status === 'ready' && Boolean(connection.transport)
)));
const selectedRemoteConnectionId = computed(() => (
  selectedLocationValue.value.startsWith('remote:')
    ? selectedLocationValue.value.slice('remote:'.length)
    : null
));
const selectedRemoteConnection = computed(() => (
  selectedRemoteConnectionId.value
    ? readyRemoteConnections.value.find((connection) => connection.id === selectedRemoteConnectionId.value) ?? null
    : null
));
const selectedLocation = computed<AutomationLocation>(() => (
  selectedRemoteConnectionId.value
    ? { kind: 'remote', remoteConnectionId: selectedRemoteConnectionId.value }
    : { kind: 'local' }
));
const isRemoteLocation = computed(() => selectedLocation.value.kind === 'remote');
const locationAutomations = computed(() => isRemoteLocation.value ? remoteSnapshot.value?.automations ?? [] : props.automations);
const locationBench = computed(() => isRemoteLocation.value ? remoteSnapshot.value?.bench ?? [] : props.bench);
const locationTeams = computed(() => isRemoteLocation.value ? remoteSnapshot.value?.teams ?? [] : props.teams);
const locationWorkBacklog = computed(() => isRemoteLocation.value ? remoteSnapshot.value?.workBacklog ?? emptyLocationSnapshot.workBacklog : props.workBacklog);
const locationSourceRepositories = computed(() => isRemoteLocation.value ? remoteSourceRepositories.value : props.sourceRepositories);
const locationWorkRepositoriesByProvider = computed(() => isRemoteLocation.value ? remoteWorkRepositoriesByProvider.value : props.workRepositoriesByProvider);
const locationWorkItemsByRepository = computed(() => isRemoteLocation.value ? remoteWorkItemsByRepository.value : props.workItemsByRepository);
const editingAutomation = computed(() => editingAutomationId.value ? locationAutomations.value.find((automation) => automation.id === editingAutomationId.value) ?? null : null);
const logAutomation = computed(() => logAutomationId.value ? locationAutomations.value.find((automation) => automation.id === logAutomationId.value) ?? null : null);
const editorKey = computed(() => editingAutomation.value?.id ?? `create-${creating.value ? 'open' : 'closed'}`);
const locationGithubConnection = computed(() => locationWorkBacklog.value.connections.find((connection) => connection.provider === 'github') ?? null);
const locationGithubRepositories = computed(() => locationWorkRepositoriesByProvider.value.github ?? []);
const automationColumns: AppDataListColumn[] = [{
  id: 'automation',
  label: translate('surface.automationsView.automation'),
  width: 'minmax(220px, 1fr)',
}, {
  id: 'lastExecution',
  label: translate('surface.automationsView.lastExecution'),
  width: 'max-content',
  align: 'end',
}, {
  id: 'executionCount',
  label: translate('surface.automationsView.executions'),
  width: 'max-content',
  align: 'end',
}];
const automationMenuItems: AppMenuItem[] = [{
  id: 'edit',
  type: 'action',
  label: translate('surface.automationsView.edit'),
  icon: PencilIcon,
}, {
  id: 'delete',
  type: 'action',
  label: translate('surface.automationsView.delete'),
  icon: Trash2Icon,
  danger: true,
}];
const automationRows = computed<AppDataListRow[]>(() => locationAutomations.value.map((automation) => ({
  agentName: automationAgentName(automation),
  executionCount: automationExecutionCountLabel(automation),
  id: automation.id,
  enabled: automation.enabled,
  error: automation.lastError ?? '',
  lastExecution: automationLastExecutionLabel(automation),
  name: automation.name,
  source: automationSourceLabel(automation),
  sourceLine: `${automationAgentName(automation)} @ ${automationSourceLabel(automation)}`,
})));

onMounted(() => {
  if (locationGithubConnection.value?.status === 'connected' && locationGithubRepositories.value.length === 0) {
    void loadGitHubRepositories();
  }
});

watch(selectedLocationValue, () => {
  closeEditor();
  closeLog();
  remoteWorkRepositoriesByProvider.value = {};
  remoteWorkItemsByRepository.value = {};
  void loadSelectedLocation();
});

watch(readyRemoteConnections, (connections) => {
  if (selectedLocationValue.value === 'local') {
    return;
  }
  if (!connections.some((connection) => remoteLocationValue(connection.id) === selectedLocationValue.value)) {
    selectedLocationValue.value = 'local';
  }
});

function openCreate(): void {
  editorMode.value = 'create';
  editingAutomationId.value = null;
  logAutomationId.value = null;
  creating.value = true;
}

function openEdit(automationId: string): void {
  editorMode.value = 'edit';
  editingAutomationId.value = automationId;
  logAutomationId.value = null;
  creating.value = false;
  openMenuAutomationId.value = null;
}

function closeEditor(): void {
  creating.value = false;
  editingAutomationId.value = null;
}

function openLog(automationId: string): void {
  creating.value = false;
  editingAutomationId.value = null;
  logAutomationId.value = automationId;
  openMenuAutomationId.value = null;
}

function closeLog(): void {
  logAutomationId.value = null;
}

async function saveAutomation(input: CreateAutomationInput): Promise<void> {
  const nextSnapshot = editorMode.value === 'edit' && editingAutomation.value
    ? await updateLocationAutomation({
      ...input,
      id: editingAutomation.value.id,
    })
    : await createLocationAutomation(input);
  refreshLocationFromSnapshot(nextSnapshot);
  closeEditor();
}

async function runAutomation(automationId: string): Promise<void> {
  openMenuAutomationId.value = null;
  refreshLocationFromSnapshot(await runLocationAutomation(automationId));
}

function setMenuVisible(automationId: string, visible: boolean): void {
  openMenuAutomationId.value = visible ? automationId : null;
}

function selectAutomationMenuItem(automationId: string, itemId: string): void {
  openMenuAutomationId.value = null;
  if (itemId === 'edit') {
    openEdit(automationId);
  } else if (itemId === 'delete') {
    void confirmDeleteAutomation(automationId);
  }
}

async function confirmDeleteAutomation(automationId: string): Promise<void> {
  const automation = locationAutomations.value.find((candidate) => candidate.id === automationId);
  if (!automation) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      `Automation "${automation.name}" will stop creating agents.`,
      translate('surface.automationsView.deleteAutomation'),
      {
        cancelButtonText: translate('common.cancel'),
        confirmButtonText: translate('dynamic.misc.deleteAutomation'),
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  refreshLocationFromSnapshot(await deleteLocationAutomation(automation.id));
  if (logAutomationId.value === automation.id) {
    logAutomationId.value = null;
  }
}

async function confirmClearAutomationHistory(automationId: string): Promise<void> {
  const automation = locationAutomations.value.find((candidate) => candidate.id === automationId);
  if (!automation || automation.executionLog.length === 0) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      `Execution history for "${automation.name}" will be cleared.`,
      translate('surface.automationsView.clearHistory'),
      {
        cancelButtonText: translate('common.cancel'),
        confirmButtonText: translate('dynamic.misc.clearHistory'),
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  refreshLocationFromSnapshot(await clearLocationAutomationHistory(automation.id));
}

async function confirmDeleteAutomationExecution(payload: { executionId: string; automationId: string }): Promise<void> {
  const automation = locationAutomations.value.find((candidate) => candidate.id === payload.automationId);
  const execution = automation?.executionLog.find((candidate) => candidate.id === payload.executionId);
  if (!automation || !execution) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      translate('surface.automationsView.thisExecutionWillBeRemovedFromTheAutomationHistory'),
      translate('surface.automationsView.deleteExecution'),
      {
        cancelButtonText: translate('common.cancel'),
        confirmButtonText: translate('dynamic.misc.deleteExecution'),
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  refreshLocationFromSnapshot(await deleteLocationAutomationExecution(automation.id, execution.id));
}

async function loadGitHubRepositories(): Promise<void> {
  const location = requestLocation();
  const repositories = location
    ? await props.loadWorkRepositories('github', location)
    : await props.loadWorkRepositories('github');
  if (location?.kind === 'remote' && selectedLocationValue.value === remoteLocationValue(location.remoteConnectionId) && repositories) {
    remoteWorkRepositoriesByProvider.value = {
      ...remoteWorkRepositoriesByProvider.value,
      github: repositories,
    };
  }
}

async function loadGitHubItems(repositoryId: string): Promise<void> {
  const location = requestLocation();
  const items = location
    ? await props.loadWorkItems('github', repositoryId, location)
    : await props.loadWorkItems('github', repositoryId);
  if (location?.kind === 'remote' && selectedLocationValue.value === remoteLocationValue(location.remoteConnectionId) && items) {
    remoteWorkItemsByRepository.value = {
      ...remoteWorkItemsByRepository.value,
      [workItemsKey('github', repositoryId)]: items,
    };
  }
}

async function readLocationConversationMessages(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]> {
  const location = requestLocation();
  return location
    ? props.readConversationMessages(ref, agentId, location)
    : props.readConversationMessages(ref, agentId);
}

async function chooseAutomationAgentFolder(): Promise<string | null> {
  if (!isRemoteLocation.value || !selectedRemoteConnection.value) {
    return props.chooseAgentFolder();
  }

  remoteFolderPickerInitialPath.value = selectedRemoteConnection.value.sourceFolderPath ?? '';
  remoteFolderPickerVisible.value = true;
  return new Promise((resolve) => {
    remoteFolderPickerResolve = resolve;
  });
}

function listAutomationSourceFolders(input?: SourceFolderListInput): Promise<SourceFolderListing> {
  const remoteConnectionId = selectedRemoteConnectionId.value;
  return props.listSourceFolders({
    ...(input ?? {}),
    ...(remoteConnectionId ? { remoteConnectionId } : {}),
  });
}

function selectRemoteFolder(path: string): void {
  remoteFolderPickerVisible.value = false;
  remoteFolderPickerResolve?.(path);
  remoteFolderPickerResolve = null;
}

function cancelRemoteFolderPicker(): void {
  remoteFolderPickerVisible.value = false;
  remoteFolderPickerResolve?.(null);
  remoteFolderPickerResolve = null;
}

async function loadSelectedLocation(): Promise<void> {
  const loadId = ++locationLoadId;
  locationError.value = null;
  if (!isRemoteLocation.value) {
    remoteSnapshot.value = null;
    remoteSourceRepositories.value = [];
    locationStatus.value = 'idle';
    if (locationGithubConnection.value?.status === 'connected' && locationGithubRepositories.value.length === 0) {
      await loadGitHubRepositories();
    }
    return;
  }

  locationStatus.value = 'loading';
  try {
    const snapshot = await props.getAutomationSnapshot(requestLocation());
    if (loadId !== locationLoadId) {
      return;
    }
    remoteSnapshot.value = snapshot;
    const sourceRepositories = selectedRemoteConnectionId.value
      ? await props.listSourceRepositories(selectedRemoteConnectionId.value)
      : [];
    if (loadId !== locationLoadId) {
      return;
    }
    remoteSourceRepositories.value = sourceRepositories;
    if (locationGithubConnection.value?.status === 'connected') {
      await loadGitHubRepositories();
    }
    if (loadId !== locationLoadId) {
      return;
    }
    locationStatus.value = 'idle';
  } catch (error) {
    if (loadId !== locationLoadId) {
      return;
    }
    remoteSnapshot.value = null;
    remoteSourceRepositories.value = [];
    locationStatus.value = 'error';
    locationError.value = error instanceof Error ? error.message : String(error);
  }
}

function refreshLocationFromSnapshot(snapshot: AppSnapshot | void): void {
  if (isRemoteLocation.value && snapshot) {
    remoteSnapshot.value = snapshot;
  }
}

function remoteLocationValue(connectionId: string): string {
  return `remote:${connectionId}`;
}

function createLocationAutomation(input: CreateAutomationInput): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.createAutomation(input, location) : props.createAutomation(input);
}

function updateLocationAutomation(input: UpdateAutomationInput): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.updateAutomation(input, location) : props.updateAutomation(input);
}

function runLocationAutomation(automationId: string): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.runAutomation(automationId, location) : props.runAutomation(automationId);
}

function clearLocationAutomationHistory(automationId: string): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.clearAutomationHistory(automationId, location) : props.clearAutomationHistory(automationId);
}

function deleteLocationAutomationExecution(automationId: string, executionId: string): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.deleteAutomationExecution(automationId, executionId, location) : props.deleteAutomationExecution(automationId, executionId);
}

function deleteLocationAutomation(automationId: string): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.deleteAutomation(automationId, location) : props.deleteAutomation(automationId);
}

function requestLocation(): AutomationLocation | undefined {
  return isRemoteLocation.value ? selectedLocation.value : undefined;
}

function workItemsKey(provider: WorkProviderKind, repositoryId: string): string {
  return `${provider}:${repositoryId}`;
}

function automationSourceLabel(automation: Automation): string {
  if (automation.source.provider === 'github') {
    return automation.source.tagName
      ? `${automation.source.repositoryId} / ${automation.source.tagName}`
      : automation.source.repositoryId;
  }
  return translate('surface.automationsView.workProvider');
}

function automationAgentName(automation: Automation): string {
  const action = automation.action;
  if (action.type === 'create-agent') {
    return translate('surface.automationsView.newAgent');
  }

  const template = locationBench.value.find((candidate) => candidate.id === action.benchTemplateId);
  return template ? template.name : translate('surface.automationsView.missingBenchAgent');
}

function automationLastExecutionLabel(automation: Automation): string {
  if (!automation.lastRunAt) {
    return translate('surface.automationsView.never');
  }

  return formatShortDate(automation.lastRunAt);
}

function automationExecutionCountLabel(automation: Automation): string {
  const count = automation.executionLog.length;
  return `${count} ${count === 1 ? 'execution' : 'executions'}`;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return translate('surface.automationsView.unknown');
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
</script>

<style scoped>
.automations-view {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  background: var(--color-shell-main);
}

.automations-view__header {
  position: absolute;
  top: 0;
  left: var(--team-rail-width);
  height: var(--workbench-appbar-height);
  width: calc(100% - var(--team-rail-width));
  background: var(--color-shell-main);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

.automations-view__content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding-top: 0;
}

.automations-view__panel {
  max-width: 720px;
  margin: 0 auto;
}

.automations-view__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.automations-view__list-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
  padding-bottom: var(--space-12);
  border-bottom: 1px solid var(--color-border);
}

.automations-view__location-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.automations-view__location-heading h3 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-16);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.automations-view__location-heading svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  color: var(--color-text-muted);
}

.automations-view__location-select {
  width: 160px;
}

.automations-view__location-state {
  padding: var(--space-12);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.automations-view__error {
  padding: var(--space-10) var(--space-12);
  border: 1px solid var(--color-error-container);
  border-radius: var(--radius-md);
  color: var(--color-on-error-container);
  background: var(--color-error-container);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.automations-view__automation-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-12);
}

.automations-view__status {
  flex: 0 0 12px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-text-muted);
  border-radius: var(--radius-full);
  background: var(--color-text-muted);
}

.automations-view__status[data-enabled="true"] {
  border-color: var(--color-success);
  background: var(--color-success);
}

.automations-view__info {
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-8);
}

.automations-view__automation-cell strong,
.automations-view__automation-cell span,
.automations-view__meta-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.automations-view__automation-cell strong {
  color: var(--color-text);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.automations-view__automation-cell span,
.automations-view__meta-cell {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.automations-view__meta-cell {
  display: block;
  text-align: right;
}

.automations-view__row-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.automations-view__row-actions button {
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

.automations-view__row-actions button:disabled {
  opacity: 0.4;
  cursor: default;
}

.automations-view__row-actions button:hover:not(:disabled),
.automations-view__row-actions button:focus-visible:not(:disabled) {
  color: var(--color-text);
}

.automations-view__row-actions svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.automations-view :deep(.app-data-list__actions) {
  opacity: 1;
  pointer-events: auto;
}
</style>
