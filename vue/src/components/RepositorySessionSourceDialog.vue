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
        <button type="button" :aria-label="t('common.back')" :disabled="preparationVisible" @click="selectedWorkItem = null">
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
        <div
          v-if="preparationVisible && assignmentState !== 'error'"
          class="repository-session-source-dialog__operation-state"
          :data-state="assignmentState"
          role="status"
        >
          <header class="repository-session-source-dialog__operation-heading">
            <span class="repository-session-source-dialog__operation-icon">
              <CircleCheckIcon v-if="preparationStep === preparationSteps.length" aria-hidden="true" />
              <SparklesIcon v-else aria-hidden="true" />
            </span>
            <div>
              <span>{{ t('repositoryBacklog.launchingFrom', { number: selectedWorkItem.number }) }}</span>
              <strong>{{ preparationTitle }}</strong>
            </div>
          </header>
          <ol>
            <li
              v-for="(step, index) in preparationSteps"
              :key="step.title"
              :class="preparationStepClass(index)"
            >
              <span class="repository-session-source-dialog__step-marker">
                <CheckIcon v-if="preparationStep > index" aria-hidden="true" />
                <LoaderIcon v-else-if="preparationStep === index" aria-hidden="true" />
                <span v-else aria-hidden="true" />
              </span>
              <div>
                <strong>{{ step.title }}</strong>
                <small>{{ step.detail }}</small>
              </div>
            </li>
          </ol>
        </div>
        <WorkItemAssignmentPicker
          v-else
          :item="selectedWorkItem"
          :branch-name="assignmentBranchName"
          :sessions="sessions"
          :error="assignmentError"
          @custom="emit('custom-work-item', $event)"
          @submit="startWorkItem"
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  IconArrowLeft as ArrowLeftIcon,
  IconCheck as CheckIcon,
  IconCircleCheck as CircleCheckIcon,
  IconCircleDot as IssueIcon,
  IconGitPullRequest as GitPullRequestIcon,
  IconLoader2 as LoaderIcon,
  IconSearch as SearchIcon,
  IconSparkles as SparklesIcon,
} from '@tabler/icons-vue';
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
  'preparation-complete': [];
  'select-branch': [branch: SourceBranch];
  'start-work-item': [selection: WorkItemAssignmentSelection];
}>();

const { t } = useI18n();

const searchInput = ref<HTMLInputElement | null>(null);
const query = ref('');
const selectedWorkItem = ref<WorkItem | null>(null);
const preparationSelection = ref<WorkItemAssignmentSelection | null>(null);
const preparationVisible = ref(false);
const preparationStep = ref(0);
let preparationStartedAt: number | null = null;
let preparationCompletionScheduled = false;
const preparationTimers: Array<ReturnType<typeof globalThis.setTimeout>> = [];
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
    { title: t('repositoryBacklog.startAgentSession'), detail: t('repositoryBacklog.newCodexSession') },
    { title: t('repositoryBacklog.handOverWorkContext'), detail: props.repositoryName },
  ];
});
const preparationTitle = computed(() => {
  const number = selectedWorkItem.value?.number ?? '';
  if (preparationStep.value === preparationSteps.value.length) {
    return t('repositoryBacklog.workReady', { number });
  }
  return t(
    preparationSelection.value?.destination === 'existing'
      ? 'repositoryBacklog.prepareExistingSession'
      : 'repositoryBacklog.buildIsolatedHome',
    { number },
  );
});

watch(() => props.visible, async (visible) => {
  if (!visible) return;
  query.value = '';
  tab.value = 'branches';
  selectedWorkItem.value = null;
  resetPreparation();
  await nextTick();
  searchInput.value?.focus();
});

watch(() => props.assignmentState, (state) => {
  if (state === 'running' && preparationSelection.value && !preparationVisible.value) {
    startPreparation();
    return;
  }
  if (state === 'success' && preparationSelection.value) {
    finishPreparation();
    return;
  }
  if (state === 'error') {
    resetPreparation(false);
  }
});

onBeforeUnmount(resetPreparation);

function onVisibilityChanged(visible: boolean): void {
  if (!visible) emit('close');
}

function startWorkItem(selection: WorkItemAssignmentSelection): void {
  preparationSelection.value = selection;
  startPreparation();
  emit('start-work-item', selection);
}

function startPreparation(): void {
  clearPreparationTimers();
  preparationVisible.value = true;
  preparationStep.value = 0;
  preparationStartedAt = Date.now();
  preparationCompletionScheduled = false;
  preparationTimers.push(globalThis.setTimeout(() => {
    preparationStep.value = 1;
  }, 1_100));
  preparationTimers.push(globalThis.setTimeout(() => {
    preparationStep.value = 2;
  }, 2_800));
}

function finishPreparation(): void {
  if (!preparationVisible.value) startPreparation();
  if (preparationCompletionScheduled) return;
  preparationCompletionScheduled = true;
  const elapsed = preparationStartedAt === null ? 0 : Date.now() - preparationStartedAt;
  preparationTimers.push(globalThis.setTimeout(() => {
    preparationStep.value = preparationSteps.value.length;
    preparationTimers.push(globalThis.setTimeout(() => emit('preparation-complete'), 600));
  }, Math.max(0, 3_800 - elapsed)));
}

function preparationStepClass(index: number): string {
  if (preparationStep.value > index) return 'is-complete';
  if (preparationStep.value === index) return 'is-active';
  return 'is-pending';
}

function resetPreparation(clearSelection = true): void {
  clearPreparationTimers();
  preparationVisible.value = false;
  preparationStep.value = 0;
  preparationStartedAt = null;
  preparationCompletionScheduled = false;
  if (clearSelection) preparationSelection.value = null;
}

function clearPreparationTimers(): void {
  preparationTimers.splice(0).forEach((timer) => globalThis.clearTimeout(timer));
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

  .repository-session-source-dialog__operation-state li {
    transition-duration: 1ms;
  }

  .repository-session-source-dialog__operation-state li.is-active
    .repository-session-source-dialog__step-marker svg {
    animation-duration: 1ms;
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
  padding: var(--space-6);
}

.repository-session-source-dialog__operation-state {
  min-height: 280px;
  display: grid;
  align-content: center;
  gap: var(--space-8);
  padding: var(--space-8);
}

.repository-session-source-dialog__operation-heading {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.repository-session-source-dialog__operation-heading > div {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.repository-session-source-dialog__operation-heading > div > span {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.repository-session-source-dialog__operation-heading strong {
  font-size: var(--font-size-16);
  line-height: var(--line-height-22);
}

.repository-session-source-dialog__operation-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-xl);
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.repository-session-source-dialog__operation-icon svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

.repository-session-source-dialog__operation-state[data-state='success']
  .repository-session-source-dialog__operation-icon {
  color: var(--color-success);
  background: var(--color-success-container);
}

.repository-session-source-dialog__operation-state ol {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.repository-session-source-dialog__operation-state li {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-4);
  min-height: 52px;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  transition: opacity 180ms ease, background-color 180ms ease;
}

.repository-session-source-dialog__operation-state li.is-active {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}

.repository-session-source-dialog__operation-state li.is-pending {
  opacity: 0.42;
}

.repository-session-source-dialog__operation-state li > div {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.repository-session-source-dialog__operation-state li strong,
.repository-session-source-dialog__operation-state li small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-session-source-dialog__operation-state li strong {
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
}

.repository-session-source-dialog__operation-state li small {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

.repository-session-source-dialog__step-marker {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: var(--color-primary);
}

.repository-session-source-dialog__step-marker svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.repository-session-source-dialog__step-marker > span {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-text-muted);
}

.repository-session-source-dialog__operation-state li.is-active
  .repository-session-source-dialog__step-marker svg {
  animation: repository-session-source-dialog-spin 0.9s linear infinite;
}

@keyframes repository-session-source-dialog-spin {
  to { transform: rotate(360deg); }
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
