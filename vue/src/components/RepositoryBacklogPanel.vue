<template>
  <section class="repository-backlog" aria-label="Repository backlog">
    <header class="repository-backlog__repository">
      <div>
        <IconBrandGithub aria-hidden="true" />
        <strong>{{ repositoryName }}</strong>
      </div>
      <span v-if="branch" class="repository-backlog__branch-pill">
        <IconGitBranch aria-hidden="true" />
        {{ branch }}
      </span>
      <button
        type="button"
        :aria-label="t('repositoryBacklog.refresh')"
        :disabled="status === 'loading'"
        @click="emit('refresh')"
      >
        <IconRefresh :class="{ 'repository-backlog__spin': status === 'loading' }" aria-hidden="true" />
      </button>
    </header>

    <div class="repository-backlog__toolbar">
      <div class="repository-backlog__segments" role="radiogroup" aria-label="Work item type">
        <button
          type="button"
          role="radio"
          :aria-checked="kindFilter === 'issue'"
          :class="{ 'repository-backlog__segment--active': kindFilter === 'issue' }"
          @click="kindFilter = 'issue'"
        >
          <IconCircleDot aria-hidden="true" />
          {{ t('repositoryBacklog.issues') }}
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="kindFilter === 'pullRequest'"
          :class="{ 'repository-backlog__segment--active': kindFilter === 'pullRequest' }"
          @click="kindFilter = 'pullRequest'"
        >
          <IconGitPullRequest aria-hidden="true" />
          {{ t('repositoryBacklog.pullRequests') }}
        </button>
      </div>

      <div class="repository-backlog__toolbar-actions">
        <button
          class="repository-backlog__toolbar-button"
          type="button"
          :aria-label="t('repositoryBacklog.search')"
          :aria-expanded="searchVisible"
          @click="toggleSearch"
        >
          <IconSearch aria-hidden="true" />
        </button>

        <el-popover
          v-model:visible="filtersVisible"
          placement="bottom-end"
          trigger="click"
          :width="280"
          popper-class="claw-popover repository-backlog__filters-popover"
        >
          <template #reference>
            <button
              class="repository-backlog__toolbar-button"
              type="button"
              :aria-label="t('repositoryBacklog.filters')"
              :aria-expanded="filtersVisible"
            >
              <IconFilter aria-hidden="true" />
              <span v-if="activeFilterCount" class="repository-backlog__filter-count">{{ activeFilterCount }}</span>
            </button>
          </template>
          <div class="repository-backlog__filter-menu">
            <header>
              <div>
                <strong>{{ t('repositoryBacklog.filters') }}</strong>
                <span>{{ repositoryName }}</span>
              </div>
              <button type="button" @click="clearFilters">{{ t('repositoryBacklog.clearFilters') }}</button>
            </header>

            <div class="repository-backlog__filter-fields">
              <label>
                <span>{{ t('repositoryBacklog.state') }}</span>
                <el-select v-model="stateFilter" size="small" aria-label="Work item state">
                  <el-option :label="t('repositoryBacklog.open')" value="open" />
                  <el-option :label="t('repositoryBacklog.closed')" value="closed" />
                  <el-option :label="t('repositoryBacklog.allStates')" value="all" />
                </el-select>
              </label>
              <label>
                <span>{{ t('repositoryBacklog.assignee') }}</span>
                <el-select v-model="assigneeFilter" size="small" aria-label="Work item assignee">
                  <el-option :label="t('repositoryBacklog.anyone')" value="all" />
                  <el-option :label="t('repositoryBacklog.assignedToMe')" value="me" :disabled="!accountLabel" />
                  <el-option :label="t('repositoryBacklog.unassigned')" value="unassigned" />
                </el-select>
              </label>
              <label>
                <span>{{ t('repositoryBacklog.label') }}</span>
                <el-select
                  v-model="labelFilter"
                  size="small"
                  :placeholder="t('repositoryBacklog.allLabels')"
                  aria-label="Work item label"
                >
                  <el-option :label="t('repositoryBacklog.allLabels')" value="" />
                  <el-option v-for="label in labelOptions" :key="label" :label="label" :value="label" />
                </el-select>
              </label>
            </div>

            <footer>
              <span v-if="defaultsSaved">{{ t('repositoryBacklog.defaultsSaved') }}</span>
              <button class="claw-button claw-button--tertiary" type="button" @click="saveFilterDefaults">
                <IconDeviceFloppy aria-hidden="true" />
                {{ t('repositoryBacklog.saveDefaults') }}
              </button>
            </footer>
          </div>
        </el-popover>
      </div>

      <div v-if="searchVisible" class="repository-backlog__search">
        <IconSearch aria-hidden="true" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="search"
          :placeholder="kindFilter === 'issue' ? t('repositoryBacklog.searchIssues') : t('repositoryBacklog.searchPullRequests')"
          aria-label="Search repository work"
          @keydown.esc="closeSearch"
        >
        <button type="button" :aria-label="t('repositoryBacklog.closeSearch')" @click="closeSearch">
          <IconX aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="status === 'loading' && items.length === 0" class="repository-backlog__state">
      <span class="repository-backlog__loader" aria-hidden="true" />
      {{ t('repositoryBacklog.loading') }}
    </div>

    <div v-else-if="error" class="repository-backlog__state repository-backlog__state--error">
      <IconAlertCircle aria-hidden="true" />
      <span>{{ error }}</span>
      <button type="button" @click="emit('refresh')">{{ t('repositoryBacklog.retry') }}</button>
    </div>

    <div v-else-if="filteredItems.length === 0" class="repository-backlog__state">
      {{ t('repositoryBacklog.empty') }}
    </div>

    <div v-else class="repository-backlog__list">
      <section v-if="attentionItems.length" class="repository-backlog__group">
        <h3>{{ t('repositoryBacklog.needsAttention') }} <span>{{ attentionItems.length }}</span></h3>
        <RepositoryItemRow
          v-for="item in attentionItems"
          :key="item.id"
          :item="item"
          :active="openItemId === item.id"
          @open="openItem(item, $event)"
        />
      </section>

      <section v-if="otherItems.length" class="repository-backlog__group">
        <h3>{{ stateFilter === 'closed' ? t('repositoryBacklog.closed') : t('repositoryBacklog.open') }} <span>{{ otherItems.length }}</span></h3>
        <RepositoryItemRow
          v-for="item in otherItems"
          :key="item.id"
          :item="item"
          :active="openItemId === item.id"
          @open="openItem(item, $event)"
        />
      </section>

      <p class="repository-backlog__result-count">
        {{ t('repositoryBacklog.showing', {
          visible: filteredItems.length,
          total: kindItems.length,
          kind: kindFilter === 'issue' ? t('repositoryBacklog.issues').toLocaleLowerCase() : t('repositoryBacklog.pullRequests').toLocaleLowerCase(),
        }) }}
      </p>
    </div>

    <el-popover
      v-if="selectedItem"
      :visible="startWorkVisible"
      virtual-triggering
      :virtual-ref="virtualReference"
      placement="bottom-end"
      :width="340"
      :teleported="true"
      popper-class="claw-popover repository-backlog__start-popover"
      @update:visible="setStartWorkVisible"
    >
      <div class="repository-backlog__start-work">
        <template v-if="operationState === 'idle' || operationState === 'error'">
          <header>
            <strong>{{ t('repositoryBacklog.startWork', { number: selectedItem.number }) }}</strong>
            <button type="button" aria-label="Close" @click="closeStartWork"><IconX aria-hidden="true" /></button>
          </header>

          <div class="repository-backlog__target-options">
            <button
              type="button"
              :class="{ 'repository-backlog__choice--selected': target === 'current' }"
              @click="target = 'current'"
            >
              <IconRobotFace aria-hidden="true" />
              <strong>{{ t('repositoryBacklog.useCurrentAgent') }}</strong>
              <span>{{ t('repositoryBacklog.useCurrentAgentDetail') }}</span>
            </button>
            <button
              type="button"
              :class="{ 'repository-backlog__choice--selected': target === 'duplicate' }"
              @click="target = 'duplicate'"
            >
              <IconCopy aria-hidden="true" />
              <strong>{{ t('repositoryBacklog.duplicateAgent') }}</strong>
              <span>{{ t('repositoryBacklog.duplicateAgentDetail') }}</span>
            </button>
          </div>

          <div class="repository-backlog__isolation">
            <span>{{ t('repositoryBacklog.isolation') }}</span>
            <label>
              <input v-model="isolation" type="radio" value="worktree">
              <IconGitBranch aria-hidden="true" />
              <strong>{{ t('repositoryBacklog.newWorktree') }}</strong>
            </label>
            <input v-model="branchName" class="repository-backlog__branch" :aria-label="t('repositoryBacklog.branchName')">
            <label :class="{ 'repository-backlog__isolation-option--disabled': target === 'duplicate' }">
              <input v-model="isolation" type="radio" value="branch" :disabled="target === 'duplicate'">
              <IconGitBranch aria-hidden="true" />
              <strong>{{ t('repositoryBacklog.newBranch') }}</strong>
            </label>
          </div>

          <p v-if="operationError" class="repository-backlog__operation-error">{{ operationError }}</p>

          <footer>
            <button class="claw-button claw-button--tertiary" type="button" @click="closeStartWork">{{ t('repositoryBacklog.cancel') }}</button>
            <button class="claw-button claw-button--primary" type="button" :disabled="!branchName.trim()" @click="startWork">
              {{ t('repositoryBacklog.start') }}
            </button>
          </footer>
        </template>

        <div v-else class="repository-backlog__operation-state" :data-state="operationState">
          <span v-if="operationState === 'running'" class="repository-backlog__operation-spinner" aria-hidden="true" />
          <IconCircleCheck v-else aria-hidden="true" />
          <strong>{{ operationState === 'running' ? t('repositoryBacklog.starting') : t('repositoryBacklog.started') }}</strong>
          <span>{{ branchName }}</span>
        </div>
      </div>
    </el-popover>
  </section>
</template>

<script setup lang="ts">
import { computed, h, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  IconAlertCircle,
  IconBrandGithub,
  IconCircleCheck,
  IconCircleDot,
  IconCopy,
  IconDeviceFloppy,
  IconDots,
  IconFilter,
  IconGitBranch,
  IconGitPullRequest,
  IconRefresh,
  IconRobotFace,
  IconSearch,
  IconX,
} from '@tabler/icons-vue';
import type { Agent, WorkBacklogAssignment, WorkIntegrationConnection, WorkItem } from '@codex-claw/core/contracts';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import type { RepositoryWorkStartInput } from './right-workspace';

defineOptions({ name: 'RepositoryBacklogPanel' });

const props = defineProps<{
  agent: Agent;
  assignments: Record<string, WorkBacklogAssignment>;
  branch?: string;
  connection?: WorkIntegrationConnection | null;
  error?: string | null;
  items: WorkItem[];
  repositoryId: string;
  status: 'notLoaded' | 'loading' | 'loaded' | 'error';
  startWorkAction: (input: RepositoryWorkStartInput) => Promise<void>;
  visible: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const { t } = useI18n();
const kindFilter = ref<'issue' | 'pullRequest'>('issue');
const stateFilter = ref<'open' | 'closed' | 'all'>('open');
const assigneeFilter = ref<'all' | 'me' | 'unassigned'>('all');
const labelFilter = ref('');
const searchQuery = ref('');
const searchVisible = ref(false);
const searchInput = ref<HTMLInputElement | null>(null);
const filtersVisible = ref(false);
const defaultsSaved = ref(false);
const selectedItem = ref<WorkItem | null>(null);
const openItemId = ref<string | null>(null);
const startWorkVisible = ref(false);
const target = ref<'current' | 'duplicate'>('current');
const isolation = ref<'branch' | 'worktree'>('worktree');
const branchName = ref('');
const operationState = ref<'idle' | 'running' | 'success' | 'error'>('idle');
const operationError = ref<string | null>(null);
const virtualReference = ref({ getBoundingClientRect: () => new DOMRect() });

const accountLabel = computed(() => props.connection?.accountLabel?.trim() ?? '');
const repositoryName = computed(() => props.repositoryId.split('/').at(-1) ?? props.repositoryId);
const labelOptions = computed(() => [...new Set(props.items.flatMap((item) => item.labels.map((label) => label.name)))].sort());
const activeFilterCount = computed(() => Number(stateFilter.value !== 'open') + Number(assigneeFilter.value !== 'all') + Number(Boolean(labelFilter.value)));
const kindItems = computed(() => props.items.filter((item) => (item.kind ?? 'issue') === kindFilter.value));
const filteredItems = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  return props.items
    .filter((item) => (item.kind ?? 'issue') === kindFilter.value)
    .filter((item) => stateFilter.value === 'all' || item.state === stateFilter.value)
    .filter((item) => assigneeFilter.value === 'all'
      || (assigneeFilter.value === 'me' && Boolean(accountLabel.value) && item.assignees?.includes(accountLabel.value))
      || (assigneeFilter.value === 'unassigned' && (item.assignees?.length ?? 0) === 0))
    .filter((item) => !labelFilter.value || item.labels.some((label) => label.name === labelFilter.value))
    .filter((item) => !query || `${item.number} ${item.title} ${item.authorName ?? ''}`.toLocaleLowerCase().includes(query))
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
});
const attentionItems = computed(() => filteredItems.value.filter((item) => {
  const assignment = props.assignments[workItemAssignmentKey(item)];
  return assignment?.agentId === props.agent.id && assignment.status === 'working';
}));
const otherItems = computed(() => filteredItems.value.filter((item) => !attentionItems.value.includes(item)));

watch(target, (value) => {
  if (value === 'duplicate') isolation.value = 'worktree';
});

watch(() => props.visible, (visible) => {
  if (!visible) {
    closeStartWork();
    closeSearch();
    filtersVisible.value = false;
  }
});

watch(labelOptions, (labels) => {
  if (labels.length > 0 && labelFilter.value && !labels.includes(labelFilter.value)) {
    labelFilter.value = '';
  }
});

watch(() => props.repositoryId, () => {
  loadFilterDefaults();
}, { immediate: true });

watch([stateFilter, assigneeFilter, labelFilter], () => {
  defaultsSaved.value = false;
});

const RepositoryItemRow = (rowProps: { item: WorkItem; active: boolean }, context: { emit: (event: 'open', element: HTMLElement) => void }) => {
  const item = rowProps.item;
  const label = item.labels[0];
  return h('article', {
    class: ['repository-backlog__item', rowProps.active ? 'repository-backlog__item--active' : ''],
  }, [
    h(item.kind === 'pullRequest' ? IconGitPullRequest : IconCircleDot, { class: 'repository-backlog__item-kind', 'aria-hidden': 'true' }),
    h('div', { class: 'repository-backlog__item-copy' }, [
      h('div', { class: 'repository-backlog__item-title' }, [h('span', `#${item.number}`), h('strong', item.title)]),
      h('div', { class: 'repository-backlog__item-meta' }, [
        h('span', { class: `repository-backlog__state-dot repository-backlog__state-dot--${item.state}` }),
        h('span', item.state === 'open' ? t('repositoryBacklog.open') : t('repositoryBacklog.closed')),
        label ? h('span', { class: 'repository-backlog__label', style: labelStyle(label.color) }, label.name) : null,
      ]),
    ]),
    h('span', { class: 'repository-backlog__item-time' }, relativeTime(item.updatedAt)),
    h('button', {
      class: 'repository-backlog__item-actions',
      type: 'button',
      'aria-label': `${t('repositoryBacklog.actions')} #${item.number}`,
      onClick: (event: MouseEvent) => context.emit('open', event.currentTarget as HTMLElement),
    }, [h(IconDots, { 'aria-hidden': 'true' })]),
  ]);
};

async function toggleSearch(): Promise<void> {
  if (searchVisible.value) {
    closeSearch();
    return;
  }
  searchVisible.value = true;
  await nextTick();
  searchInput.value?.focus();
}

function closeSearch(): void {
  searchQuery.value = '';
  searchVisible.value = false;
}

function clearFilters(): void {
  stateFilter.value = 'open';
  assigneeFilter.value = 'all';
  labelFilter.value = '';
}

function saveFilterDefaults(): void {
  try {
    window.localStorage.setItem(filterDefaultsKey(), JSON.stringify({
      state: stateFilter.value,
      assignee: assigneeFilter.value,
      label: labelFilter.value,
    }));
    defaultsSaved.value = true;
  } catch {
    defaultsSaved.value = false;
  }
}

function loadFilterDefaults(): void {
  const defaults = readFilterDefaults();
  stateFilter.value = defaults.state;
  assigneeFilter.value = defaults.assignee;
  labelFilter.value = defaults.label;
  defaultsSaved.value = false;
}

function readFilterDefaults(): {
  state: 'open' | 'closed' | 'all';
  assignee: 'all' | 'me' | 'unassigned';
  label: string;
} {
  try {
    const stored = window.localStorage.getItem(filterDefaultsKey());
    if (!stored) return { state: 'open', assignee: 'all', label: '' };
    const value = JSON.parse(stored) as Record<string, unknown>;
    return {
      state: value.state === 'closed' || value.state === 'all' ? value.state : 'open',
      assignee: value.assignee === 'unassigned' || (value.assignee === 'me' && accountLabel.value) ? value.assignee : 'all',
      label: typeof value.label === 'string' && value.label.length <= 100 && (labelOptions.value.length === 0 || labelOptions.value.includes(value.label)) ? value.label : '',
    };
  } catch {
    return { state: 'open', assignee: 'all', label: '' };
  }
}

function filterDefaultsKey(): string {
  return `repositoryBacklogFilters:${props.repositoryId}`;
}

function openItem(item: WorkItem, element?: HTMLElement): void {
  const reference = element ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  if (reference) virtualReference.value = reference;
  selectedItem.value = item;
  openItemId.value = item.id;
  startWorkVisible.value = true;
  target.value = 'current';
  isolation.value = 'worktree';
  branchName.value = suggestedBranch(item);
  operationState.value = 'idle';
  operationError.value = null;
}

function closeStartWork(): void {
  startWorkVisible.value = false;
  selectedItem.value = null;
  openItemId.value = null;
}

function setStartWorkVisible(visible: boolean): void {
  if (visible) {
    startWorkVisible.value = true;
    return;
  }
  closeStartWork();
}

async function startWork(): Promise<void> {
  const item = selectedItem.value;
  if (!item || !branchName.value.trim() || operationState.value === 'running') return;
  operationState.value = 'running';
  operationError.value = null;
  try {
    await props.startWorkAction({
      item,
      target: target.value,
      branchName: branchName.value.trim(),
      createWorktree: target.value === 'duplicate' || isolation.value === 'worktree',
    });
    operationState.value = 'success';
    globalThis.setTimeout(closeStartWork, 1_200);
  } catch (error) {
    operationState.value = 'error';
    operationError.value = error instanceof Error ? error.message : String(error);
  }
}

function suggestedBranch(item: WorkItem): string {
  const prefix = item.kind === 'pullRequest'
    ? 'review'
    : item.labels.some((label) => /bug|fix/iu.test(label.name)) ? 'fix' : 'feature';
  const slug = item.title.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 42);
  return `${prefix}/${item.number}${slug ? `-${slug}` : ''}`;
}

function relativeTime(value: string): string {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1_000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  if (elapsedSeconds < 3_600) return `${Math.floor(elapsedSeconds / 60)}m`;
  if (elapsedSeconds < 86_400) return `${Math.floor(elapsedSeconds / 3_600)}h`;
  return `${Math.floor(elapsedSeconds / 86_400)}d`;
}

function labelStyle(color?: string): Record<string, string> {
  return color && /^[0-9a-f]{6}$/iu.test(color)
    ? { '--repository-label-color': `#${color}` }
    : {};
}
</script>

<style scoped>
.repository-backlog {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  background: var(--color-shell-main);
}

.repository-backlog__repository {
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--color-border);
}

.repository-backlog__repository > div {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.repository-backlog__repository svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.repository-backlog__repository strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-backlog__branch-pill {
  min-width: 0;
  height: 26px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: var(--color-surface-lowest);
  font-size: var(--font-size-12);
}

.repository-backlog__repository .repository-backlog__branch-pill svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
}

.repository-backlog__repository > button {
  width: 28px;
  height: 28px;
  margin-left: auto;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.repository-backlog__repository > button:hover {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.repository-backlog__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--color-border);
}

.repository-backlog__segments {
  justify-self: start;
  display: flex;
  padding: 2px;
  border-radius: var(--radius-lg);
  background: var(--color-surface-low);
}

.repository-backlog__segments button {
  height: 26px;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-6);
  border: 0;
  border-radius: calc(var(--radius-lg) - 2px);
  color: var(--color-text-muted);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-12);
  cursor: pointer;
}

.repository-backlog__segments button svg {
  width: 14px;
  height: 14px;
}

.repository-backlog__segments .repository-backlog__segment--active {
  color: var(--color-text);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-sm);
}

.repository-backlog__search {
  grid-column: 1 / -1;
  min-width: 0;
  height: 30px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
}

.repository-backlog__search svg {
  flex: 0 0 auto;
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.repository-backlog__search input {
  min-width: 0;
  flex: 1 1 auto;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-12);
}

.repository-backlog__search button {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.repository-backlog__toolbar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.repository-backlog__toolbar-button {
  position: relative;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-12);
  cursor: pointer;
}

.repository-backlog__toolbar-button:hover,
.repository-backlog__toolbar-button[aria-expanded="true"] {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.repository-backlog__toolbar-button svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.repository-backlog__filter-count {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  padding: 0 3px;
  border: 2px solid var(--color-shell-main);
  border-radius: var(--radius-full);
  color: var(--color-primary);
  background: var(--color-primary-container);
  font-size: var(--font-size-11);
}

.repository-backlog__filter-menu {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-3);
}

.repository-backlog__filter-menu > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.repository-backlog__filter-menu > header > div {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.repository-backlog__filter-menu > header strong {
  font-size: var(--font-size-13);
}

.repository-backlog__filter-menu > header span {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-backlog__filter-menu > header > button {
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-11);
  cursor: pointer;
}

.repository-backlog__filter-fields {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  background: var(--color-surface-low);
}

.repository-backlog__filter-fields label {
  display: grid;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

.repository-backlog__filter-fields :deep(.el-select) {
  width: 100%;
}

.repository-backlog__filter-menu > footer {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
}

.repository-backlog__filter-menu > footer > span {
  margin-right: auto;
  color: var(--color-success);
  font-size: var(--font-size-11);
}

.repository-backlog__filter-menu > footer .claw-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-11);
}

.repository-backlog__filter-menu > footer svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.repository-backlog__list {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: var(--space-3) var(--space-6) var(--space-6);
}

.repository-backlog__group + .repository-backlog__group {
  margin-top: var(--space-4);
}

.repository-backlog__group h3 {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
  padding: var(--space-3) var(--space-1);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
}

.repository-backlog__group h3 span {
  min-width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  font-size: var(--font-size-11);
  font-weight: var(--font-weight-regular);
}

:deep(.repository-backlog__item) {
  min-width: 0;
  display: grid;
  grid-template-columns: var(--icon-md) minmax(0, 1fr) auto 28px;
  align-items: center;
  gap: var(--space-3);
  min-height: 54px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-lowest);
}

:deep(.repository-backlog__item + .repository-backlog__item) {
  margin-top: var(--space-2);
}

:deep(.repository-backlog__item:hover),
:deep(.repository-backlog__item--active) {
  background: var(--color-surface-low);
}

:deep(.repository-backlog__item--active) {
  border-color: var(--color-primary);
}

:deep(.repository-backlog__item-kind) {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

:deep(.repository-backlog__item-copy) {
  min-width: 0;
  display: grid;
  gap: 2px;
}

:deep(.repository-backlog__item-title) {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

:deep(.repository-backlog__item-title span) {
  flex: 0 0 auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

:deep(.repository-backlog__item-title strong) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
}

:deep(.repository-backlog__item-meta) {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

:deep(.repository-backlog__state-dot) {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--color-outline);
}

:deep(.repository-backlog__state-dot--open) {
  background: var(--color-success);
}

:deep(.repository-backlog__label) {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px var(--space-3);
  border-radius: var(--radius-full);
  color: var(--repository-label-color, var(--color-text-muted));
  background: color-mix(
    in srgb,
    var(--repository-label-color, var(--color-outline)) 12%,
    transparent
  );
}

:deep(.repository-backlog__item-time) {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  font-variant-numeric: tabular-nums;
}

:deep(.repository-backlog__item-actions) {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.repository-backlog__result-count {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

:deep(.repository-backlog__item-actions:hover) {
  color: var(--color-text);
  background: var(--color-surface-high);
}

:deep(.repository-backlog__item-actions svg) {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.repository-backlog__state {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-10);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}

.repository-backlog__state--error {
  color: var(--color-error);
}

.repository-backlog__state button {
  border: 0;
  color: var(--color-primary);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.repository-backlog__loader,
.repository-backlog__operation-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: var(--radius-full);
  animation: repository-backlog-spin 800ms linear infinite;
}

.repository-backlog__start-work {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-3);
}

.repository-backlog__start-work > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.repository-backlog__start-work > header > button {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.repository-backlog__start-work > header > button svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.repository-backlog__target-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.repository-backlog__target-options > button {
  min-height: 86px;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 3px;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text);
  background: transparent;
  font: inherit;
  text-align: center;
  cursor: pointer;
}

.repository-backlog__target-options strong {
  font-size: var(--font-size-12);
}

.repository-backlog__target-options > button:hover {
  border-color: var(--color-outline);
  background: var(--color-surface-low);
}

.repository-backlog__target-options > .repository-backlog__choice--selected {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.repository-backlog__target-options svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.repository-backlog__target-options span {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  line-height: 1.25;
}

.repository-backlog__isolation {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.repository-backlog__isolation > span {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
}

.repository-backlog__isolation label {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  font-size: var(--font-size-12);
}

.repository-backlog__isolation label svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  color: var(--color-text-muted);
}

.repository-backlog__isolation-option--disabled {
  opacity: 0.45;
  cursor: default !important;
}

.repository-backlog__branch {
  height: 28px;
  margin-left: 27px;
  padding: 0 var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-11);
}

.repository-backlog__operation-error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--font-size-12);
}

.repository-backlog__start-work footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: 0;
}

.repository-backlog__operation-state {
  min-height: 190px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--space-4);
  text-align: center;
}

.repository-backlog__operation-state svg {
  width: 32px;
  height: 32px;
  color: var(--color-success);
}

.repository-backlog__operation-state > span:last-child {
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-11);
}

.repository-backlog__spin {
  animation: repository-backlog-spin 800ms linear infinite;
}

@keyframes repository-backlog-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .repository-backlog__toolbar {
    grid-template-columns: 1fr auto;
  }
}
</style>
