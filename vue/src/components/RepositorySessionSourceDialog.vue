<template>
  <el-dialog
    class="claw-dialog claw-dialog--compact repository-session-source-dialog"
    :model-value="visible"
    :teleported="false"
    width="720px"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="repository-session-source-dialog__search-row">
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
    </template>

    <div class="repository-session-source-dialog__toolbar">
      <el-tabs v-model="tab" class="repository-session-source-dialog__tabs" :aria-label="t('repositories.sessionSource.type')">
        <el-tab-pane v-for="option in tabs" :key="option.id" :name="option.id" :label="option.label" />
      </el-tabs>
      <span class="repository-session-source-dialog__repository"><RepositoryIcon aria-hidden="true" />{{ repositoryName }}</span>
    </div>

    <section class="repository-session-source-dialog__results" aria-live="polite">
      <p v-if="loading" class="repository-session-source-dialog__state">{{ t('repositories.sessionSource.loading') }}</p>
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
        <button v-for="item in filteredWorkItems" :key="item.id" class="repository-session-source-dialog__result" type="button" @click="emit('select-work-item', item)">
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
import { IconCircleDot as IssueIcon, IconGitPullRequest as GitPullRequestIcon, IconSearch as SearchIcon } from '@tabler/icons-vue';
import type { SourceBranch, WorkItem } from '@codex-claw/core/contracts';
import { ArrowRightIcon, GitBranchIcon, GitForkIcon as RepositoryIcon } from '../shared/icons/app-icons';

type SourceTab = 'branches' | 'pullRequests' | 'issues';

const props = withDefaults(defineProps<{
  branches?: SourceBranch[];
  error?: string | null;
  loading?: boolean;
  repositoryName: string;
  visible: boolean;
  workItems?: WorkItem[];
}>(), {
  branches: () => [],
  error: null,
  loading: false,
  workItems: () => [],
});

const emit = defineEmits<{
  close: [];
  'select-branch': [branch: SourceBranch];
  'select-work-item': [item: WorkItem];
}>();

const { t } = useI18n();

const searchInput = ref<HTMLInputElement | null>(null);
const query = ref('');
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

watch(() => props.visible, async (visible) => {
  if (!visible) return;
  query.value = '';
  tab.value = 'branches';
  await nextTick();
  searchInput.value?.focus();
});

function onVisibilityChanged(visible: boolean): void {
  if (!visible) emit('close');
}
</script>

<style scoped>
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
