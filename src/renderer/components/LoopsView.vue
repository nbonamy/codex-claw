<template>
  <section
    class="loops-view"
    aria-label="Loops"
  >
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
            @clear-history="confirmClearLoopHistory"
            @close="closeLog"
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
                  <div>
                    <strong>{{ row.name }}</strong>
                    <span>
                      {{ row.source }}
                      <span aria-hidden="true">&bull;</span>
                      {{ row.detail }}
                    </span>
                  </div>
                </div>
              </template>

              <template #cell-schedule="{ row }">
                <span class="loops-view__schedule-cell">{{ row.schedule }}</span>
              </template>

              <template #actions="{ row }">
                <div class="loops-view__row-actions">
                  <button
                    type="button"
                    aria-label="View loop log"
                    @click="openLog(row.id)"
                  >
                    <ListDetailsIcon aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Edit loop"
                    @click="openEdit(row.id)"
                  >
                    <PencilIcon aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete loop"
                    @click="confirmDeleteLoop(row.id)"
                  >
                    <Trash2Icon aria-hidden="true" />
                  </button>
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
import type { AppSnapshot, CreateLoopInput, Loop, UpdateLoopInput, WorkItem, WorkProviderKind, WorkRepository } from '../../shared/contracts';
import AppDataList from './AppDataList.vue';
import type { AppDataListColumn, AppDataListRow } from './app-data-list';
import LoopEditor from './LoopEditor.vue';
import LoopExecutionLog from './LoopExecutionLog.vue';
import LoopWelcome from './LoopWelcome.vue';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import { ListDetailsIcon, PencilIcon, Trash2Icon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  bench: AppSnapshot['bench'];
  clearLoopHistory?: (loopId: string) => Promise<void>;
  createLoop?: (input: CreateLoopInput) => Promise<void>;
  deleteLoop?: (loopId: string) => Promise<void>;
  loadWorkItems?: (provider: WorkProviderKind, repositoryId: string) => Promise<void>;
  loadWorkRepositories?: (provider: WorkProviderKind) => Promise<void>;
  loops: Loop[];
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
  deleteLoop: async () => undefined,
  loadWorkItems: async () => undefined,
  loadWorkRepositories: async () => undefined,
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
  id: 'schedule',
  label: 'Schedule',
  width: 'max-content',
  align: 'end',
}];
const loopRows = computed<AppDataListRow[]>(() => props.loops.map((loop) => ({
  id: loop.id,
  detail: loopDetailLabel(loop),
  enabled: loop.enabled,
  error: loop.lastError ?? '',
  name: loop.name,
  schedule: loopScheduleLabel(loop),
  source: loopSourceLabel(loop),
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
}

function closeEditor(): void {
  creating.value = false;
  editingLoopId.value = null;
}

function openLog(loopId: string): void {
  creating.value = false;
  editingLoopId.value = null;
  logLoopId.value = loopId;
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

function loopDetailLabel(loop: Loop): string {
  const template = props.bench.find((candidate) => candidate.id === loop.action.benchTemplateId);
  const benchLabel = template ? template.name : 'Missing Bench agent';
  const target = loop.action.teamTarget;
  if (target.mode === 'dedicated') {
    return `${benchLabel} - dedicated teams`;
  }

  const teamLabel = props.teams.find((team) => team.id === target.teamId)?.name ?? 'Missing team';
  return `${benchLabel} - ${teamLabel}`;
}

function loopScheduleLabel(loop: Loop): string {
  if (!loop.lastRunAt) {
    return 'Every few minutes';
  }

  const created = loop.lastCreatedCount ?? 0;
  return `${formatShortDate(loop.lastRunAt)} - ${created} created`;
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

.loops-view__content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--space-32) 0;
}

.loops-view__panel {
  max-width: 980px;
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
  background: transparent;
}

.loops-view__status[data-enabled="true"] {
  border-color: var(--color-success);
}

.loops-view__loop-cell div {
  min-width: 0;
}

.loops-view__loop-cell strong,
.loops-view__loop-cell span,
.loops-view__schedule-cell {
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
.loops-view__schedule-cell {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
}

.loops-view__loop-cell strong + span {
  margin-left: var(--space-8);
}

.loops-view__loop-cell span span {
  padding: 0 var(--space-4);
}

.loops-view__schedule-cell {
  display: block;
  text-align: right;
}

.loops-view__row-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
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

.loops-view__row-actions button:hover,
.loops-view__row-actions button:focus-visible {
  color: var(--color-text);
}

.loops-view__row-actions svg {
  width: var(--icon-md);
  height: var(--icon-md);
}
</style>
