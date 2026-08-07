<template>
  <section
    class="loops-view"
    aria-label="Loops"
  >

    <div class="loops-view__header" />

    <main class="loops-view__content">
      <div class="loops-view__panel">
        <SettingsPanelFrame
          title="Loops"
          title-id="loops-title"
        >
          <div
            v-if="!editorVisible && !logLoop"
            class="loops-view__list-header"
          >
            <div class="loops-view__location-heading">
              <h3>Loops</h3>
              <ChevronRightIcon aria-hidden="true" />
              <el-select
                v-model="selectedLocationValue"
                class="loops-view__location-select"
                aria-label="Loop location"
                size="small"
              >
                <el-option
                  label="Local"
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
              v-if="locationLoops.length > 0"
              type="primary"
              @click="openCreate"
            >
              New Loop
            </el-button>
          </div>

          <LoopEditor
            v-if="editorVisible"
            :key="editorKey"
            :backend-models="backendModels"
            :bench-templates="locationBench"
            :choose-agent-folder="chooseLoopAgentFolder"
            :connection="locationGithubConnection"
            :items-by-repository="locationWorkItemsByRepository"
            :loop="editingLoop"
            :mode="editorMode"
            :repositories="locationGithubRepositories"
            :source-repositories="locationSourceRepositories"
            :teams="locationTeams"
            @cancel="closeEditor"
            @load-items="loadGitHubItems"
            @load-repositories="loadGitHubRepositories"
            @submit="saveLoop"
          />

          <LoopExecutionLog
            v-else-if="logLoop"
            :loop="logLoop"
            :messages="messages"
            :read-conversation-messages="readLocationConversationMessages"
            @clear-history="confirmClearLoopHistory"
            @close="closeLog"
            @delete-execution="confirmDeleteLoopExecution"
          />

          <div
            v-else-if="locationStatus === 'loading'"
            class="loops-view__location-state"
          >
            Loading loops...
          </div>

          <div
            v-else-if="locationStatus === 'error'"
            class="loops-view__error"
          >
            {{ locationError }}
          </div>

          <LoopWelcome
            v-else-if="locationLoops.length === 0"
            @create="openCreate"
          />

          <div
            v-else
            class="loops-view__list"
          >
            <AppDataList
              aria-label="Loops"
              :columns="loopColumns"
              :rows="loopRows"
            >
              <template #cell-loop="{ row }">
                <div class="loops-view__loop-cell">
                  <span
                    class="loops-view__status"
                    :data-enabled="row.enabled"
                  />
                  <div class="loops-view__info">
                    <strong>{{ row.name }}</strong>
                    <span>{{ row.sourceLine }}</span>
                  </div>
                </div>
              </template>

              <template #cell-lastExecution="{ row }">
                <span class="loops-view__meta-cell">{{ row.lastExecution }}</span>
              </template>

              <template #cell-executionCount="{ row }">
                <span class="loops-view__meta-cell">{{ row.executionCount }}</span>
              </template>

              <template #actions="{ row }">
                <div class="loops-view__row-actions">
                  <button
                    type="button"
                    :aria-label="`Run ${row.name}`"
                    :disabled="!row.enabled"
                    @click="runLoop(row.id)"
                  >
                    <PlayerPlayIcon aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    :aria-label="`View logs for ${row.name}`"
                    @click="openLog(row.id)"
                  >
                    <LogsIcon aria-hidden="true" />
                  </button>
                  <el-popover
                    :visible="openMenuLoopId === row.id"
                    placement="bottom-end"
                    trigger="manual"
                    width="180"
                    :teleported="true"
                    popper-class="claw-popover loops-view__menu-popover"
                    @update:visible="setMenuVisible(row.id, $event)"
                  >
                    <template #reference>
                      <button
                        type="button"
                        :aria-label="`${row.name} actions`"
                        @click="setMenuVisible(row.id, openMenuLoopId !== row.id)"
                      >
                        <DotsVerticalIcon aria-hidden="true" />
                      </button>
                    </template>
                    <AppMenu
                      class="app-menu--embedded"
                      ariaLabel="Loop actions"
                      :items="loopMenuItems"
                      @click.stop
                      @select="selectLoopMenuItem(row.id, $event)"
                    />
                  </el-popover>
                </div>
              </template>
            </AppDataList>

            <div
              v-if="workBacklogStatus === 'error' && workBacklogError"
              class="loops-view__error"
            >
              {{ workBacklogError }}
            </div>
          </div>
        </SettingsPanelFrame>
      </div>
    </main>

    <RemoteFolderPickerDialog
      :initial-path="remoteFolderPickerInitialPath"
      :list-source-folders="listLoopSourceFolders"
      :remote-connection-id="selectedRemoteConnectionId ?? ''"
      :visible="remoteFolderPickerVisible"
      @close="cancelRemoteFolderPicker"
      @select="selectRemoteFolder"
    />
  </section>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';
import { computed, onMounted, ref, watch } from 'vue';
import type { AppSnapshot, BackendConversationRef, BackendModelOption, CreateLoopInput, Loop, LoopLocation, RemoteConnection, RendererMessage, SourceFolderListing, SourceFolderListInput, SourceRepository, UpdateLoopInput, WorkItem, WorkProviderKind, WorkRepository } from '@codex-claw/core/contracts';
import { createEmptySnapshot } from '@codex-claw/core/snapshot';
import AppDataList from './AppDataList.vue';
import type { AppDataListColumn, AppDataListRow } from './app-data-list';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import LoopEditor from './LoopEditor.vue';
import LoopExecutionLog from './LoopExecutionLog.vue';
import LoopWelcome from './LoopWelcome.vue';
import RemoteFolderPickerDialog from './RemoteFolderPickerDialog.vue';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import { ChevronRightIcon, DotsVerticalIcon, LogsIcon, PencilIcon, PlayerPlayIcon, Trash2Icon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  backendModels?: BackendModelOption[];
  bench: AppSnapshot['bench'];
  chooseAgentFolder?: () => Promise<string | null>;
  clearLoopHistory?: (loopId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  createLoop?: (input: CreateLoopInput, location?: LoopLocation) => Promise<AppSnapshot | void>;
  deleteLoopExecution?: (loopId: string, executionId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  deleteLoop?: (loopId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  getLoopSnapshot?: (location?: LoopLocation) => Promise<AppSnapshot>;
  listSourceFolders?: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  listSourceRepositories?: (remoteConnectionId?: string) => Promise<SourceRepository[]>;
  loadWorkItems?: (provider: WorkProviderKind, repositoryId: string, location?: LoopLocation) => Promise<WorkItem[] | void>;
  loadWorkRepositories?: (provider: WorkProviderKind, location?: LoopLocation) => Promise<WorkRepository[] | void>;
  loops: Loop[];
  messages?: RendererMessage[];
  remoteConnections?: RemoteConnection[];
  runLoop?: (loopId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  readConversationMessages?: (ref: BackendConversationRef, agentId: string, location?: LoopLocation) => Promise<RendererMessage[]>;
  sourceRepositories?: SourceRepository[];
  teams: AppSnapshot['teams'];
  updateLoop?: (input: UpdateLoopInput, location?: LoopLocation) => Promise<AppSnapshot | void>;
  workBacklog: AppSnapshot['workBacklog'];
  workBacklogError?: string | null;
  workBacklogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  workItemsByRepository?: Record<string, WorkItem[]>;
  workRepositoriesByProvider?: Partial<Record<WorkProviderKind, WorkRepository[]>>;
}>(), {
  backendModels: () => [],
  clearLoopHistory: async () => undefined,
  chooseAgentFolder: async () => null,
  createLoop: async () => undefined,
  deleteLoopExecution: async () => undefined,
  deleteLoop: async () => undefined,
  getLoopSnapshot: async () => createEmptySnapshot(),
  listSourceFolders: async () => ({ path: '', parentPath: null, entries: [] }),
  listSourceRepositories: async () => [],
  loadWorkItems: async () => undefined,
  loadWorkRepositories: async () => undefined,
  messages: () => [],
  readConversationMessages: async () => [],
  remoteConnections: () => [],
  runLoop: async () => undefined,
  sourceRepositories: () => [],
  updateLoop: async () => undefined,
  workBacklogError: null,
  workBacklogStatus: 'notLoaded',
  workItemsByRepository: () => ({}),
  workRepositoriesByProvider: () => ({}),
});

type EditorMode = 'create' | 'edit';
type LocationStatus = 'idle' | 'loading' | 'error';

const editorMode = ref<EditorMode>('create');
const editingLoopId = ref<string | null>(null);
const logLoopId = ref<string | null>(null);
const openMenuLoopId = ref<string | null>(null);
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

const editorVisible = computed(() => editorMode.value === 'create' ? creating.value : Boolean(editingLoop.value));
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
const selectedLocation = computed<LoopLocation>(() => (
  selectedRemoteConnectionId.value
    ? { kind: 'remote', remoteConnectionId: selectedRemoteConnectionId.value }
    : { kind: 'local' }
));
const isRemoteLocation = computed(() => selectedLocation.value.kind === 'remote');
const locationLoops = computed(() => isRemoteLocation.value ? remoteSnapshot.value?.loops ?? [] : props.loops);
const locationBench = computed(() => isRemoteLocation.value ? remoteSnapshot.value?.bench ?? [] : props.bench);
const locationTeams = computed(() => isRemoteLocation.value ? remoteSnapshot.value?.teams ?? [] : props.teams);
const locationWorkBacklog = computed(() => isRemoteLocation.value ? remoteSnapshot.value?.workBacklog ?? emptyLocationSnapshot.workBacklog : props.workBacklog);
const locationSourceRepositories = computed(() => isRemoteLocation.value ? remoteSourceRepositories.value : props.sourceRepositories);
const locationWorkRepositoriesByProvider = computed(() => isRemoteLocation.value ? remoteWorkRepositoriesByProvider.value : props.workRepositoriesByProvider);
const locationWorkItemsByRepository = computed(() => isRemoteLocation.value ? remoteWorkItemsByRepository.value : props.workItemsByRepository);
const editingLoop = computed(() => editingLoopId.value ? locationLoops.value.find((loop) => loop.id === editingLoopId.value) ?? null : null);
const logLoop = computed(() => logLoopId.value ? locationLoops.value.find((loop) => loop.id === logLoopId.value) ?? null : null);
const editorKey = computed(() => editingLoop.value?.id ?? `create-${creating.value ? 'open' : 'closed'}`);
const locationGithubConnection = computed(() => locationWorkBacklog.value.connections.find((connection) => connection.provider === 'github') ?? null);
const locationGithubRepositories = computed(() => locationWorkRepositoriesByProvider.value.github ?? []);
const loopColumns: AppDataListColumn[] = [{
  id: 'loop',
  label: 'Loop',
  width: 'minmax(220px, 1fr)',
}, {
  id: 'lastExecution',
  label: 'Last execution',
  width: 'max-content',
  align: 'end',
}, {
  id: 'executionCount',
  label: 'Executions',
  width: 'max-content',
  align: 'end',
}];
const loopMenuItems: AppMenuItem[] = [{
  id: 'edit',
  type: 'action',
  label: 'Edit',
  icon: PencilIcon,
}, {
  id: 'delete',
  type: 'action',
  label: 'Delete',
  icon: Trash2Icon,
  danger: true,
}];
const loopRows = computed<AppDataListRow[]>(() => locationLoops.value.map((loop) => ({
  agentName: loopAgentName(loop),
  executionCount: loopExecutionCountLabel(loop),
  id: loop.id,
  enabled: loop.enabled,
  error: loop.lastError ?? '',
  lastExecution: loopLastExecutionLabel(loop),
  name: loop.name,
  source: loopSourceLabel(loop),
  sourceLine: `${loopAgentName(loop)} @ ${loopSourceLabel(loop)}`,
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
  editingLoopId.value = null;
  logLoopId.value = null;
  creating.value = true;
}

function openEdit(loopId: string): void {
  editorMode.value = 'edit';
  editingLoopId.value = loopId;
  logLoopId.value = null;
  creating.value = false;
  openMenuLoopId.value = null;
}

function closeEditor(): void {
  creating.value = false;
  editingLoopId.value = null;
}

function openLog(loopId: string): void {
  creating.value = false;
  editingLoopId.value = null;
  logLoopId.value = loopId;
  openMenuLoopId.value = null;
}

function closeLog(): void {
  logLoopId.value = null;
}

async function saveLoop(input: CreateLoopInput): Promise<void> {
  const nextSnapshot = editorMode.value === 'edit' && editingLoop.value
    ? await updateLocationLoop({
      ...input,
      id: editingLoop.value.id,
    })
    : await createLocationLoop(input);
  refreshLocationFromSnapshot(nextSnapshot);
  closeEditor();
}

async function runLoop(loopId: string): Promise<void> {
  openMenuLoopId.value = null;
  refreshLocationFromSnapshot(await runLocationLoop(loopId));
}

function setMenuVisible(loopId: string, visible: boolean): void {
  openMenuLoopId.value = visible ? loopId : null;
}

function selectLoopMenuItem(loopId: string, itemId: string): void {
  openMenuLoopId.value = null;
  if (itemId === 'edit') {
    openEdit(loopId);
  } else if (itemId === 'delete') {
    void confirmDeleteLoop(loopId);
  }
}

async function confirmDeleteLoop(loopId: string): Promise<void> {
  const loop = locationLoops.value.find((candidate) => candidate.id === loopId);
  if (!loop) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      `Loop "${loop.name}" will stop creating agents.`,
      'Delete loop?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Delete Loop',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  refreshLocationFromSnapshot(await deleteLocationLoop(loop.id));
  if (logLoopId.value === loop.id) {
    logLoopId.value = null;
  }
}

async function confirmClearLoopHistory(loopId: string): Promise<void> {
  const loop = locationLoops.value.find((candidate) => candidate.id === loopId);
  if (!loop || loop.executionLog.length === 0) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      `Execution history for "${loop.name}" will be cleared.`,
      'Clear history?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Clear History',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  refreshLocationFromSnapshot(await clearLocationLoopHistory(loop.id));
}

async function confirmDeleteLoopExecution(payload: { executionId: string; loopId: string }): Promise<void> {
  const loop = locationLoops.value.find((candidate) => candidate.id === payload.loopId);
  const execution = loop?.executionLog.find((candidate) => candidate.id === payload.executionId);
  if (!loop || !execution) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      'This execution will be removed from the loop history.',
      'Delete execution?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Delete Execution',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  refreshLocationFromSnapshot(await deleteLocationLoopExecution(loop.id, execution.id));
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

async function chooseLoopAgentFolder(): Promise<string | null> {
  if (!isRemoteLocation.value || !selectedRemoteConnection.value) {
    return props.chooseAgentFolder();
  }

  remoteFolderPickerInitialPath.value = selectedRemoteConnection.value.sourceFolderPath ?? '';
  remoteFolderPickerVisible.value = true;
  return new Promise((resolve) => {
    remoteFolderPickerResolve = resolve;
  });
}

function listLoopSourceFolders(input?: SourceFolderListInput): Promise<SourceFolderListing> {
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
    const snapshot = await props.getLoopSnapshot(requestLocation());
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

function createLocationLoop(input: CreateLoopInput): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.createLoop(input, location) : props.createLoop(input);
}

function updateLocationLoop(input: UpdateLoopInput): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.updateLoop(input, location) : props.updateLoop(input);
}

function runLocationLoop(loopId: string): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.runLoop(loopId, location) : props.runLoop(loopId);
}

function clearLocationLoopHistory(loopId: string): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.clearLoopHistory(loopId, location) : props.clearLoopHistory(loopId);
}

function deleteLocationLoopExecution(loopId: string, executionId: string): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.deleteLoopExecution(loopId, executionId, location) : props.deleteLoopExecution(loopId, executionId);
}

function deleteLocationLoop(loopId: string): Promise<AppSnapshot | void> {
  const location = requestLocation();
  return location ? props.deleteLoop(loopId, location) : props.deleteLoop(loopId);
}

function requestLocation(): LoopLocation | undefined {
  return isRemoteLocation.value ? selectedLocation.value : undefined;
}

function workItemsKey(provider: WorkProviderKind, repositoryId: string): string {
  return `${provider}:${repositoryId}`;
}

function loopSourceLabel(loop: Loop): string {
  if (loop.source.provider === 'github') {
    return loop.source.tagName
      ? `${loop.source.repositoryId} / ${loop.source.tagName}`
      : loop.source.repositoryId;
  }
  return 'Work provider';
}

function loopAgentName(loop: Loop): string {
  const action = loop.action;
  if (action.type === 'create-agent') {
    return 'New Agent';
  }

  const template = locationBench.value.find((candidate) => candidate.id === action.benchTemplateId);
  return template ? template.name : 'Missing Bench agent';
}

function loopLastExecutionLabel(loop: Loop): string {
  if (!loop.lastRunAt) {
    return 'Never';
  }

  return formatShortDate(loop.lastRunAt);
}

function loopExecutionCountLabel(loop: Loop): string {
  const count = loop.executionLog.length;
  return `${count} ${count === 1 ? 'execution' : 'executions'}`;
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
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
.loops-view {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
  background: var(--color-shell-main);
}

.loops-view__header {
  position: absolute;
  top: 0;
  left: var(--team-rail-width);
  height: var(--workbench-appbar-height);
  width: calc(100% - var(--team-rail-width));
  background: var(--color-shell-main);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

.loops-view__content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding-top: 0;
}

.loops-view__panel {
  max-width: 720px;
  margin: 0 auto;
}

.loops-view__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
}

.loops-view__list-header {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
  padding-bottom: var(--space-12);
  border-bottom: 1px solid var(--color-border);
}

.loops-view__location-heading {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.loops-view__location-heading h3 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-16);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.loops-view__location-heading svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  color: var(--color-text-muted);
}

.loops-view__location-select {
  width: 160px;
}

.loops-view__location-state {
  padding: var(--space-12);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.loops-view__error {
  padding: var(--space-10) var(--space-12);
  border: 1px solid var(--color-error-container);
  border-radius: var(--radius-md);
  color: var(--color-on-error-container);
  background: var(--color-error-container);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.loops-view__loop-cell {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-12);
}

.loops-view__status {
  flex: 0 0 12px;
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-text-muted);
  border-radius: var(--radius-full);
  background: var(--color-text-muted);
}

.loops-view__status[data-enabled="true"] {
  border-color: var(--color-success);
  background: var(--color-success);
}

.loops-view__info {
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-8);
}

.loops-view__loop-cell strong,
.loops-view__loop-cell span,
.loops-view__meta-cell {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loops-view__loop-cell strong {
  color: var(--color-text);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.loops-view__loop-cell span,
.loops-view__meta-cell {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.loops-view__meta-cell {
  display: block;
  text-align: right;
}

.loops-view__row-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.loops-view__row-actions button {
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

.loops-view__row-actions button:disabled {
  opacity: 0.4;
  cursor: default;
}

.loops-view__row-actions button:hover:not(:disabled),
.loops-view__row-actions button:focus-visible:not(:disabled) {
  color: var(--color-text);
}

.loops-view__row-actions svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.loops-view :deep(.app-data-list__actions) {
  opacity: 1;
  pointer-events: auto;
}
</style>
