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
          <LoopEditor
            v-if="editorVisible"
            :key="editorKey"
            :bench-templates="bench"
            :connection="githubConnection"
            :items-by-repository="workItemsByRepository"
            :loop="editingLoop"
            :mode="editorMode"
            :repositories="githubRepositories"
            :teams="teams"
            @cancel="closeEditor"
            @load-items="loadGitHubItems"
            @load-repositories="loadGitHubRepositories"
            @submit="saveLoop"
          />

          <LoopExecutionLog
            v-else-if="logLoop"
            :loop="logLoop"
            :messages="messages"
            :read-conversation-messages="readConversationMessages"
            @clear-history="confirmClearLoopHistory"
            @close="closeLog"
            @delete-execution="confirmDeleteLoopExecution"
          />

          <LoopWelcome
            v-else-if="loops.length === 0"
            @create="openCreate"
          />

          <div
            v-else
            class="loops-view__list"
          >
            <AppDataList
              title="Current"
              aria-label="Current loops"
              :columns="loopColumns"
              :rows="loopRows"
            >
              <template #headerActions>
                <el-button
                  type="primary"
                  @click="openCreate"
                >
                  New Loop
                </el-button>
              </template>

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
  </section>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import type { AppSnapshot, BackendConversationRef, CreateLoopInput, Loop, RendererMessage, UpdateLoopInput, WorkItem, WorkProviderKind, WorkRepository } from '../../shared/contracts';
import AppDataList from './AppDataList.vue';
import type { AppDataListColumn, AppDataListRow } from './app-data-list';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import LoopEditor from './LoopEditor.vue';
import LoopExecutionLog from './LoopExecutionLog.vue';
import LoopWelcome from './LoopWelcome.vue';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import { DotsVerticalIcon, LogsIcon, PencilIcon, PlayerPlayIcon, Trash2Icon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  bench: AppSnapshot['bench'];
  clearLoopHistory?: (loopId: string) => Promise<void>;
  createLoop?: (input: CreateLoopInput) => Promise<void>;
  deleteLoopExecution?: (loopId: string, executionId: string) => Promise<void>;
  deleteLoop?: (loopId: string) => Promise<void>;
  loadWorkItems?: (provider: WorkProviderKind, repositoryId: string) => Promise<void>;
  loadWorkRepositories?: (provider: WorkProviderKind) => Promise<void>;
  loops: Loop[];
  messages?: RendererMessage[];
  runLoop?: (loopId: string) => Promise<void>;
  readConversationMessages?: (ref: BackendConversationRef, agentId: string) => Promise<RendererMessage[]>;
  teams: AppSnapshot['teams'];
  updateLoop?: (input: UpdateLoopInput) => Promise<void>;
  workBacklog: AppSnapshot['workBacklog'];
  workBacklogError?: string | null;
  workBacklogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  workItemsByRepository?: Record<string, WorkItem[]>;
  workRepositoriesByProvider?: Partial<Record<WorkProviderKind, WorkRepository[]>>;
}>(), {
  clearLoopHistory: async () => undefined,
  createLoop: async () => undefined,
  deleteLoopExecution: async () => undefined,
  deleteLoop: async () => undefined,
  loadWorkItems: async () => undefined,
  loadWorkRepositories: async () => undefined,
  messages: () => [],
  readConversationMessages: async () => [],
  runLoop: async () => undefined,
  updateLoop: async () => undefined,
  workBacklogError: null,
  workBacklogStatus: 'notLoaded',
  workItemsByRepository: () => ({}),
  workRepositoriesByProvider: () => ({}),
});

type EditorMode = 'create' | 'edit';

const editorMode = ref<EditorMode>('create');
const editingLoopId = ref<string | null>(null);
const logLoopId = ref<string | null>(null);
const openMenuLoopId = ref<string | null>(null);
const editorVisible = computed(() => editorMode.value === 'create' ? creating.value : Boolean(editingLoop.value));
const creating = ref(false);
const editingLoop = computed(() => editingLoopId.value ? props.loops.find((loop) => loop.id === editingLoopId.value) ?? null : null);
const logLoop = computed(() => logLoopId.value ? props.loops.find((loop) => loop.id === logLoopId.value) ?? null : null);
const editorKey = computed(() => editingLoop.value?.id ?? `create-${creating.value ? 'open' : 'closed'}`);
const githubConnection = computed(() => props.workBacklog.connections.find((connection) => connection.provider === 'github') ?? null);
const githubRepositories = computed(() => props.workRepositoriesByProvider.github ?? []);
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
const loopRows = computed<AppDataListRow[]>(() => props.loops.map((loop) => ({
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
  if (githubConnection.value?.status === 'connected' && githubRepositories.value.length === 0) {
    void loadGitHubRepositories();
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
  if (editorMode.value === 'edit' && editingLoop.value) {
    await props.updateLoop({
      ...input,
      id: editingLoop.value.id,
    });
  } else {
    await props.createLoop(input);
  }
  closeEditor();
}

async function runLoop(loopId: string): Promise<void> {
  openMenuLoopId.value = null;
  await props.runLoop(loopId);
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
  const loop = props.loops.find((candidate) => candidate.id === loopId);
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

  await props.deleteLoop(loop.id);
  if (logLoopId.value === loop.id) {
    logLoopId.value = null;
  }
}

async function confirmClearLoopHistory(loopId: string): Promise<void> {
  const loop = props.loops.find((candidate) => candidate.id === loopId);
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

  await props.clearLoopHistory(loop.id);
}

async function confirmDeleteLoopExecution(payload: { executionId: string; loopId: string }): Promise<void> {
  const loop = props.loops.find((candidate) => candidate.id === payload.loopId);
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

  await props.deleteLoopExecution(loop.id, execution.id);
}

async function loadGitHubRepositories(): Promise<void> {
  await props.loadWorkRepositories('github');
}

async function loadGitHubItems(repositoryId: string): Promise<void> {
  await props.loadWorkItems('github', repositoryId);
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
  const template = props.bench.find((candidate) => candidate.id === loop.action.benchTemplateId);
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
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
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
