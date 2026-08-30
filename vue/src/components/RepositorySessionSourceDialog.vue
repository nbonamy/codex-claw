<template>
  <el-dialog
    class="claw-dialog claw-dialog--compact repository-session-source-dialog"
    :class="{ 'repository-session-source-dialog--assignment': selectedWorkItem }"
    :model-value="visible"
    :teleported="false"
    :style="{ width: selectedWorkItem ? '480px' : '720px' }"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div v-if="!selectedWorkItem" class="repository-session-source-dialog__search-row">
        <SearchIcon aria-hidden="true" />
        <input
          ref="searchInput"
          v-model="query"
          :placeholder="searchPlaceholder"
          :aria-label="t('repositories.sessionSource.search')"
          autocomplete="off"
          spellcheck="false"
        >
      </div>
      <div v-else class="repository-session-source-dialog__assignment-header">
        <button type="button" :aria-label="t('common.back')" @click="selectedWorkItem = null">
          <ArrowLeftIcon aria-hidden="true" />
        </button>
        <strong>{{ t('repositoryBacklog.startWork', { number: selectedWorkItem.number }) }}</strong>
      </div>
    </template>

    <div v-if="!selectedWorkItem" class="repository-session-source-dialog__toolbar">
      <el-tabs v-model="tab" class="repository-session-source-dialog__tabs" :aria-label="t('repositories.sessionSource.type')">
        <el-tab-pane v-for="option in tabs" :key="option.id" :name="option.id" :label="option.label" />
      </el-tabs>
      <span class="repository-session-source-dialog__repository"><RepositoryIcon aria-hidden="true" />{{ repositoryName }}</span>
    </div>

    <section class="repository-session-source-dialog__results" aria-live="polite">
      <template v-if="selectedWorkItem">
        <div v-if="assignmentState === 'running' || assignmentState === 'success'" class="repository-session-source-dialog__operation-state" :data-state="assignmentState">
          <span v-if="assignmentState === 'running'" class="repository-session-source-dialog__operation-spinner" aria-hidden="true" />
          <CircleCheckIcon v-else aria-hidden="true" />
          <strong>{{ assignmentState === 'running' ? t('repositoryBacklog.starting') : t('repositoryBacklog.started') }}</strong>
          <span>{{ assignmentBranchName }}</span>
        </div>
        <WorkItemAssignmentPicker
          v-else
          :item="selectedWorkItem"
          :branch-name="assignmentBranchName"
          :sessions="sessions"
          :error="assignmentError"
          @custom="emit('custom-work-item', $event)"
          @submit="emit('start-work-item', $event)"
        />
      </template>
      <p v-else-if="loading" class="repository-session-source-dialog__state">{{ t('repositories.sessionSource.loading') }}</p>
      <p v-else-if="error" class="repository-session-source-dialog__state repository-session-source-dialog__state--error">{{ error }}</p>
      <template v-else-if="tab === 'branches'">
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
        <button v-for="item in filteredWorkItems" :key="item.id" class="repository-session-source-dialog__result" type="button" @click="selectedWorkItem = item">
          <GitPullRequestIcon v-if="item.kind === 'pullRequest'" class="repository-session-source-dialog__result-icon" aria-hidden="true" />
          <IssueIcon v-else class="repository-session-source-dialog__result-icon" aria-hidden="true" />
          <span class="repository-session-source-dialog__result-copy">
            <small>#{{ item.number }}</small>
            <strong>{{ item.title }}</strong>
          </span>
          <ArrowRightIcon class="repository-session-source-dialog__arrow" aria-hidden="true" />
        </button>
        <p v-if="filteredWorkItems.length === 0" class="repository-session-source-dialog__state">{{ tab === 'pullRequests' ? t('repositories.sessionSource.noPullRequests') : t('repositories.sessionSource.noIssues') }}</p>
      </template>
    </section>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconArrowLeft as ArrowLeftIcon, IconCircleCheck as CircleCheckIcon, IconCircleDot as IssueIcon, IconGitPullRequest as GitPullRequestIcon, IconSearch as SearchIcon } from '@tabler/icons-vue';
import type { SourceBranch, WorkItem } from '@codex-claw/core/contracts';
import { ArrowRightIcon, GitBranchIcon, GitForkIcon as RepositoryIcon } from '../shared/icons/app-icons';
import WorkItemAssignmentPicker from './WorkItemAssignmentPicker.vue';
import type { WorkItemAssignmentSelection, WorkItemAssignmentSession } from './WorkItemAssignmentPicker.vue';

type SourceTab = 'branches' | 'pullRequests' | 'issues';

const props = withDefaults(defineProps<{
  branches?: SourceBranch[];
  assignmentError?: string | null;
  assignmentState?: 'idle' | 'running' | 'success' | 'error';
  error?: string | null;
  loading?: boolean;
  repositoryName: string;
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
});

const emit = defineEmits<{
  close: [];
  'custom-work-item': [selection: Omit<WorkItemAssignmentSelection, 'action'>];
  'select-branch': [branch: SourceBranch];
  'start-work-item': [selection: WorkItemAssignmentSelection];
}>();

const { t } = useI18n();

const searchInput = ref<HTMLInputElement | null>(null);
const query = ref('');
const selectedWorkItem = ref<WorkItem | null>(null);
const tab = ref<SourceTab>('branches');
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
const filteredWorkItems = computed(() => props.workItems.filter((item) => {
  if (tab.value === 'pullRequests' && item.kind !== 'pullRequest') return false;
  if (tab.value === 'issues' && item.kind === 'pullRequest') return false;
  const haystack = `${item.number} ${item.title} ${item.authorName ?? ''} ${item.url}`.toLocaleLowerCase();
  return haystack.includes(normalizedQuery.value);
}));
const assignmentBranchName = computed(() => {
  const item = selectedWorkItem.value;
  if (!item) return '';
  if (item.kind === 'pullRequest') return item.branchName?.trim() || `review/gh-${item.number}`;
  return `fix/gh-${item.number}`;
});

watch(() => props.visible, async (visible) => {
  if (!visible) return;
  query.value = '';
  tab.value = 'branches';
  selectedWorkItem.value = null;
  await nextTick();
  searchInput.value?.focus();
});

function onVisibilityChanged(visible: boolean): void {
  if (!visible) emit('close');
}
</script>

<style scoped>
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
  padding: var(--space-6);
}

.repository-session-source-dialog__operation-state {
  min-height: 250px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-4);
  text-align: center;
}

.repository-session-source-dialog__operation-state svg {
  width: 32px;
  height: 32px;
  color: var(--color-success);
}

.repository-session-source-dialog__operation-state > span:last-child {
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-11);
}

.repository-session-source-dialog__operation-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: repository-session-source-dialog-spin 0.8s linear infinite;
}

@keyframes repository-session-source-dialog-spin {
  to {
    transform: rotate(360deg);
  }
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
