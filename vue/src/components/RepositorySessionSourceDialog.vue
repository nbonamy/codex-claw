<template>
  <el-dialog
    class="claw-dialog claw-dialog--compact repository-session-source-dialog"
    :class="{ 'repository-session-source-dialog--assignment': selectedWorkItem, 'repository-session-source-dialog--issue-picker': purpose === 'missionIssue' }"
    :model-value="visible"
    :teleported="false"
    :style="{ width: selectedWorkItem ? '440px' : '720px' }"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <BacklogSourceSelector v-if="!selectedWorkItem && (purpose === 'missionIssue' || tab === 'issues')" :provider="linear.provider.value" :sources="linear.provider.value === 'linear' ? linear.sources.value : repositories" :source-id="linear.provider.value === 'linear' ? linear.sourceId.value : selectedRepositoryId" :show-source="purpose === 'missionIssue' || linear.provider.value === 'linear'" @select-provider="selectProvider" @select-source="selectSource" />
      <div v-if="!selectedWorkItem" class="repository-session-source-dialog__search-row">
        <SearchIcon aria-hidden="true" />
        <input
          ref="searchInput"
          v-model="query"
          :placeholder="searchPlaceholder"
          :aria-label="t(purpose === 'missionIssue' ? 'repositories.sessionSource.searchIssues' : 'repositories.sessionSource.search')"
          autocomplete="off"
          spellcheck="false"
        >
      </div>
      <div v-else class="repository-session-source-dialog__assignment-header">
        <button type="button" :aria-label="t('common.back')" :disabled="preparationVisible" @click="selectedWorkItem = null">
          <ArrowLeftIcon aria-hidden="true" />
        </button>
        <strong>{{ selectedWorkItem.identifier ?? t('repositoryBacklog.startWork', { number: selectedWorkItem.number }) }}</strong>
      </div>
    </template>

    <div v-if="!selectedWorkItem && purpose === 'session'" class="repository-session-source-dialog__toolbar">
      <el-tabs v-model="tab" class="repository-session-source-dialog__tabs" :aria-label="t('repositories.sessionSource.type')">
        <el-tab-pane v-for="option in tabs" :key="option.id" :name="option.id" :label="option.label" />
      </el-tabs>
      <span class="repository-session-source-dialog__repository"><RepositoryIcon aria-hidden="true" />{{ repositoryName }}</span>
    </div>

    <section class="repository-session-source-dialog__results" aria-live="polite">
      <p v-if="purpose === 'missionIssue' && linear.provider.value === 'github' && error" class="repository-session-source-dialog__state repository-session-source-dialog__state--error" role="alert">{{ error }}</p>
      <template v-if="selectedWorkItem">
        <LinearIssueDetail v-if="selectedWorkItem.provider === 'linear'" :item="selectedWorkItem" />
        <StagedOperationProgress
          v-else-if="preparationVisible && assignmentState !== 'error'"
          :state="assignmentState === 'success' ? 'success' : 'running'"
          :eyebrow="t('repositoryBacklog.launchingFrom', { number: selectedWorkItem.number })"
          :title="preparationTitle"
          :complete-title="t('repositoryBacklog.workReady', { number: selectedWorkItem.number })"
          :steps="preparationSteps"
          @complete="emit('preparation-complete')"
        />
        <WorkItemAssignmentPicker
          v-else
          v-model:backend="backend"
          :item="selectedWorkItem"
          :branch-name="assignmentBranchName"
          :existing-worktree-path="assignmentExistingWorktreePath"
          :sessions="sessions"
          :error="assignmentError"
          @custom="emit('custom-work-item', $event)"
          @submit="startWorkItem"
        />
      </template>
      <p v-else-if="effectiveLoading" class="repository-session-source-dialog__state">{{ t('repositories.sessionSource.loading') }}</p>
      <p v-else-if="tab === 'issues' && linear.provider.value === 'linear' && linear.error.value" role="alert">{{ linear.error.value }} <button type="button" @click="linear.refresh">{{ t('backlogSource.retry') }}</button></p>
      <p v-else-if="purpose === 'session' && (tab !== 'issues' || linear.provider.value === 'github') && error" class="repository-session-source-dialog__state repository-session-source-dialog__state--error">{{ error }}</p>
      <p v-else-if="purpose === 'missionIssue' && linear.provider.value === 'github' && repositories.length === 0" class="repository-session-source-dialog__state">{{ t('repositories.sessionSource.noRepositories') }}</p>
      <p v-else-if="purpose === 'missionIssue' && linear.provider.value === 'github' && !selectedRepositoryId" class="repository-session-source-dialog__state">{{ t('repositories.sessionSource.chooseRepositoryToSeeIssues') }}</p>
      <template v-else-if="tab === 'branches' && purpose === 'session'">
        <h3>{{ t('repositories.sessionSource.recentBranches') }}</h3>
        <button v-for="branch in filteredBranches" :key="branch.name" class="repository-session-source-dialog__result" type="button" @click="emit('select-branch', branch)">
          <GitBranchIcon
            class="repository-session-source-dialog__result-icon repository-session-source-dialog__result-icon--branch"
            :class="{
              'repository-session-source-dialog__result-icon--default': branch.isDefault,
              'repository-session-source-dialog__result-icon--worktree': branch.worktreePath && !branch.isDefault,
            }"
            aria-hidden="true"
          />
          <span class="repository-session-source-dialog__result-copy">
            <strong>{{ branch.name }}</strong>
            <small v-if="branch.isDefault">{{ t('repositories.sessionSource.default') }}</small>
          </span>
          <span v-if="branch.worktreePath" class="repository-session-source-dialog__badge">{{ t('repositories.sessionSource.checkedOut') }}</span>
          <ArrowRightIcon class="repository-session-source-dialog__arrow" aria-hidden="true" />
        </button>
        <p v-if="filteredBranches.length === 0" class="repository-session-source-dialog__state">{{ t('repositories.sessionSource.noBranches') }}</p>
      </template>
      <template v-else>
        <h3>{{ tab === 'pullRequests' ? t('repositories.sessionSource.recentPullRequests') : t('repositories.sessionSource.recentIssues') }}</h3>
        <button v-for="item in filteredWorkItems" :key="item.id" class="repository-session-source-dialog__result" type="button" @click="selectWorkItem(item)">
          <GitPullRequestIcon v-if="item.kind === 'pullRequest'" class="repository-session-source-dialog__result-icon" aria-hidden="true" />
          <IssueIcon v-else class="repository-session-source-dialog__result-icon" aria-hidden="true" />
          <span class="repository-session-source-dialog__result-copy">
            <small>{{ item.identifier ?? `#${item.number}` }}</small>
            <strong>{{ item.title }}</strong>
          </span>
          <ArrowRightIcon class="repository-session-source-dialog__arrow" aria-hidden="true" />
        </button>
        <p v-if="filteredWorkItems.length === 0" class="repository-session-source-dialog__state">{{ tab === 'pullRequests' ? t('repositories.sessionSource.noPullRequests') : t('repositories.sessionSource.noIssues') }}</p>
      </template>
    </section>
    <template v-if="backendChoices.length !== 1 && purpose === 'session' && !selectedWorkItem" #footer>
      <BackendSelector v-model="backend" size="small" :disabled="preparationVisible" />
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  IconArrowLeft as ArrowLeftIcon,
  IconCircleDot as IssueIcon,
  IconGitPullRequest as GitPullRequestIcon,
  IconSearch as SearchIcon,
} from '@tabler/icons-vue';
import type { SourceBranch, WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import BacklogSourceSelector from './BacklogSourceSelector.vue';
import LinearIssueDetail from './LinearIssueDetail.vue';
import { useLinearBacklog } from './use-linear-backlog';
import { ArrowRightIcon, GitBranchIcon, GitForkIcon as RepositoryIcon } from '../shared/icons/app-icons';
import WorkItemAssignmentPicker from './WorkItemAssignmentPicker.vue';
import BackendSelector from './BackendSelector.vue';
import { useBackendChoices, useNewAgentBackend } from './backend-selection';
const backendChoices = useBackendChoices();
const backend = defineModel<import('@codex-claw/core/contracts').AgentBackend>('backend');
useNewAgentBackend(backend, backendChoices);
import StagedOperationProgress from './StagedOperationProgress.vue';
import type { WorkItemAssignmentSelection, WorkItemAssignmentSession } from './WorkItemAssignmentPicker.vue';

type SourceTab = 'branches' | 'pullRequests' | 'issues';

const props = withDefaults(defineProps<{
  location?: import('@codex-claw/core/contracts').AutomationLocation;
  branches?: SourceBranch[];
  assignmentError?: string | null;
  assignmentState?: 'idle' | 'running' | 'success' | 'error';
  error?: string | null;
  loading?: boolean;
  repositoryName: string;
  purpose?: 'session' | 'missionIssue';
  repositories?: WorkRepository[];
  selectedRepositoryId?: string | null;
  sessions?: WorkItemAssignmentSession[];
  visible: boolean;
  workItems?: WorkItem[];
}>(), {
  branches: () => [],
  assignmentError: null,
  assignmentState: 'idle',
  error: null,
  loading: false,
  sessions: () => [],
  workItems: () => [],
  purpose: 'session',
  repositories: () => [],
  selectedRepositoryId: null,
});

const emit = defineEmits<{
  close: [];
  'custom-work-item': [selection: Omit<WorkItemAssignmentSelection, 'action'>];
  'preparation-complete': [];
  'select-branch': [branch: SourceBranch];
  'select-repository': [repositoryId: string];
  'select-work-item': [item: WorkItem];
  'start-work-item': [selection: WorkItemAssignmentSelection];
}>();

const { t } = useI18n();
const linear = useLinearBacklog(() => props.location);
const effectiveLoading = computed(() => linear.provider.value === 'linear' && tab.value === 'issues' ? linear.status.value === 'loading' : props.loading);
async function selectProvider(provider: import('@codex-claw/core/contracts').WorkProviderKind): Promise<void> {
  selectedWorkItem.value = null;
  query.value = '';
  resetPreparation();
  await linear.selectProvider(provider);
}
function selectSource(id: string | null): void {
  selectedWorkItem.value = null;
  query.value = '';
  resetPreparation();
  if (linear.provider.value === 'linear') void linear.selectSource(id);
  else if (id) emit('select-repository', id);
}

const searchInput = ref<HTMLInputElement | null>(null);
const query = ref('');
const selectedWorkItem = ref<WorkItem | null>(null);
const preparationSelection = ref<WorkItemAssignmentSelection | null>(null);
const preparationVisible = ref(false);
const tab = ref<SourceTab>(props.purpose === 'missionIssue' ? 'issues' : 'branches');
const tabs = computed<ReadonlyArray<{ id: SourceTab; label: string }>>(() => [
  { id: 'branches', label: t('repositories.sessionSource.branches') },
  { id: 'pullRequests', label: t('repositories.sessionSource.pullRequests') },
  { id: 'issues', label: t('repositories.sessionSource.issues') },
]);
const searchPlaceholder = computed(() => tab.value === 'branches'
  ? t('repositories.sessionSource.searchBranch')
  : t('repositories.sessionSource.searchWork'));
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase());
const filteredBranches = computed(() => props.branches.filter((branch) => branch.name.toLocaleLowerCase().includes(normalizedQuery.value)));
const filteredWorkItems = computed(() => (linear.provider.value === 'linear' && tab.value === 'issues' ? linear.items.value : props.workItems).filter((item) => {
  if (props.purpose === 'missionIssue' && item.kind === 'pullRequest') return false;
  if (tab.value === 'pullRequests' && item.kind !== 'pullRequest') return false;
  if (tab.value === 'issues' && item.kind === 'pullRequest') return false;
  const haystack = `${item.identifier ?? item.number} ${item.title} ${item.authorName ?? ''} ${item.url}`.toLocaleLowerCase();
  return haystack.includes(normalizedQuery.value);
}));
const assignmentBranchName = computed(() => {
  const item = selectedWorkItem.value;
  if (!item) return '';
  if (item.kind === 'pullRequest') return item.branchName?.trim() || `review/gh-${item.number}`;
  return `fix/gh-${item.number}`;
});
const assignmentExistingWorktreePath = computed(() => (
  props.branches.find((branch) => branch.name === assignmentBranchName.value)?.worktreePath ?? ''
));
const preparationSteps = computed(() => {
  if (preparationSelection.value?.destination === 'existing') {
    const session = props.sessions.find((candidate) => candidate.agentId === preparationSelection.value?.agentId);
    return [
      { title: t('repositoryBacklog.prepareWorkBranch'), detail: assignmentBranchName.value },
      { title: t('repositoryBacklog.switchExistingSession'), detail: session?.label ?? t('repositoryBacklog.existingSession') },
      { title: t('repositoryBacklog.handOverWorkContext'), detail: props.repositoryName },
    ];
  }
  return [
    { title: t('repositoryBacklog.createIsolatedWorktree'), detail: assignmentBranchName.value },
    { title: t('agentCreationProgress.initializeWorktree'), detail: t('agentCreationProgress.checkProjectSetup') },
    { title: t('repositoryBacklog.startAgentSession'), detail: t('repositoryBacklog.newCodexSession') },
    { title: t('repositoryBacklog.handOverWorkContext'), detail: props.repositoryName },
  ];
});
const preparationTitle = computed(() => {
  const number = selectedWorkItem.value?.number ?? '';
  return t(
    preparationSelection.value?.destination === 'existing'
      ? 'repositoryBacklog.prepareExistingSession'
      : 'repositoryBacklog.buildIsolatedHome',
    { number },
  );
});

watch(() => props.visible, async (visible) => {
  if (!visible) { void linear.selectProvider('github'); return; }
  query.value = '';
  tab.value = props.purpose === 'missionIssue' ? 'issues' : 'branches';
  selectedWorkItem.value = null;
  resetPreparation();
  await nextTick();
  searchInput.value?.focus();
});

watch(() => props.assignmentState, (state) => {
  if (state === 'running' && preparationSelection.value && !preparationVisible.value) {
    preparationVisible.value = true;
    return;
  }
  if (state === 'error') {
    resetPreparation(false);
  }
});

watch(() => `${JSON.stringify(props.location)}:${props.selectedRepositoryId}:${props.repositoryName}`, () => {
  selectedWorkItem.value = null;
  query.value = '';
  resetPreparation();
});

function onVisibilityChanged(visible: boolean): void {
  if (!visible) emit('close');
}

function selectWorkItem(item: WorkItem): void {
  if (!filteredWorkItems.value.some(candidate => candidate.id === item.id)) return;
  if (props.purpose === 'missionIssue') emit('select-work-item', item);
  if (props.purpose === 'session' || item.provider === 'linear') selectedWorkItem.value = item;
}

function startWorkItem(selection: WorkItemAssignmentSelection): void {
  preparationSelection.value = selection;
  preparationVisible.value = true;
  emit('start-work-item', selection);
}

function resetPreparation(clearSelection = true): void {
  preparationVisible.value = false;
  if (clearSelection) preparationSelection.value = null;
}
</script>

<style scoped>
.repository-session-source-dialog :deep(.el-dialog__footer) {
  text-align: left;
}
:global(.repository-session-source-dialog.el-dialog) {
  overflow: hidden;
  transition: width 240ms ease;
  will-change: width;
}

@media (prefers-reduced-motion: reduce) {
  :global(.repository-session-source-dialog.el-dialog) {
    transition-duration: 1ms;
  }
}

.repository-session-source-dialog__search-row {
  display: grid;
  grid-template-columns: var(--icon-md) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-6) var(--space-8);
}

.repository-session-source-dialog__search-row svg {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.repository-session-source-dialog__search-row input {
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
}

.repository-session-source-dialog--issue-picker .repository-session-source-dialog__search-row {
  grid-template-columns: var(--icon-md) minmax(0, 1fr) minmax(160px, 220px);
}

/* The compact dialog otherwise puts the selector beneath Element Plus's 48px close button. */
:global(.repository-session-source-dialog--issue-picker.claw-dialog--compact .el-dialog__header) {
  padding-right: 48px;
}

.repository-session-source-dialog__repository-select { min-width: 0; }

@media (max-width: 680px) {
  .repository-session-source-dialog--issue-picker .repository-session-source-dialog__search-row {
    grid-template-columns: var(--icon-md) minmax(0, 1fr);
  }

  .repository-session-source-dialog__repository-select { grid-column: 1 / -1; }
}

.repository-session-source-dialog__assignment-header {
  min-height: 54px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
}

.repository-session-source-dialog__assignment-header button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.repository-session-source-dialog__assignment-header button:hover {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.repository-session-source-dialog__assignment-header button:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.repository-session-source-dialog__assignment-header svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.repository-session-source-dialog__assignment-header strong {
  font-size: var(--font-size-14);
}

.repository-session-source-dialog__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
  padding: var(--space-3) var(--space-8);
  border-top: 1px solid var(--color-border);
  border-bottom: 1px solid var(--color-border);
}

.repository-session-source-dialog__tabs {
  min-width: 0;
}

.repository-session-source-dialog__tabs :deep(.el-tabs__header) {
  margin: 0;
}

.repository-session-source-dialog__tabs :deep(.el-tabs__nav-wrap::after),
.repository-session-source-dialog__tabs :deep(.el-tabs__active-bar),
.repository-session-source-dialog__tabs :deep(.el-tabs__content) {
  display: none;
}

.repository-session-source-dialog__tabs :deep(.el-tabs__item) {
  height: auto;
  padding: var(--space-3) var(--space-6);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.repository-session-source-dialog__tabs
  :deep(.el-tabs__item.is-top:nth-child(2)) {
  padding-left: var(--space-6);
}

.repository-session-source-dialog__tabs
  :deep(.el-tabs__item.is-top:last-child) {
  padding-right: var(--space-6);
}

.repository-session-source-dialog__tabs :deep(.el-tabs__item.is-active) {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.repository-session-source-dialog__repository {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-session-source-dialog__repository svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.repository-session-source-dialog__results {
  min-height: 260px;
  max-height: min(52vh, 520px);
  overflow-y: auto;
  padding: var(--space-8);
}

.repository-session-source-dialog--assignment
  .repository-session-source-dialog__results {
  min-height: 0;
  padding: var(--space-3) var(--space-8) var(--space-8);
}

.repository-session-source-dialog__results h3 {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
}

.repository-session-source-dialog__result {
  width: 100%;
  min-height: 38px;
  display: grid;
  grid-template-columns: var(--icon-md) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-1) var(--space-6);
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.repository-session-source-dialog__result:hover,
.repository-session-source-dialog__result:focus-visible {
  outline: 0;
  background: var(--color-surface-base);
}

.repository-session-source-dialog__result-copy {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.repository-session-source-dialog__result-copy strong {
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-session-source-dialog__result-icon,
.repository-session-source-dialog__arrow {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.repository-session-source-dialog__result-icon--branch {
  color: var(--color-success);
}

.repository-session-source-dialog__result-icon--default {
  color: var(--color-primary);
}

.repository-session-source-dialog__result-icon--worktree {
  color: var(--color-warning);
}

.repository-session-source-dialog__result-copy small {
  flex: none;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.repository-session-source-dialog__badge {
  justify-self: end;
  padding: 1px var(--space-3);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: var(--color-surface-base);
  font-size: var(--font-size-11);
  white-space: nowrap;
}

.repository-session-source-dialog__arrow {
  grid-column: -2 / -1;
  margin-left: auto;
}

.repository-session-source-dialog__state {
  margin: var(--space-20) 0;
  color: var(--color-text-muted);
  text-align: center;
}

.repository-session-source-dialog__state--error {
  color: var(--color-error);
}
</style>
