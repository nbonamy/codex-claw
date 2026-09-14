<template>
  <section class="cockpit-view" :aria-label="$t('surface.cockpitView.backlog')">
    <aside class="cockpit-view__navigation" :aria-label="$t('surface.cockpitView.backlogNavigation')">
      <nav>
        <div class="cockpit-view__navigation-section">
          <strong>{{ $t('surface.cockpitView.repositories') }}</strong>
          <el-dropdown
            placement="bottom-end"
            trigger="click"
            @command="selectRepositorySortMode"
          >
            <button
              class="cockpit-view__repository-sort"
              type="button"
              :aria-label="$t('dynamic.cockpit.sortRepositories', { sort: repositorySortDescription })"
            >
              {{ repositorySortLabel }}
              <IconChevronDown aria-hidden="true" />
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="recent">{{ $t('surface.cockpitView.recentActivity') }}</el-dropdown-item>
                <el-dropdown-item command="alphabetical">{{ $t('surface.cockpitView.alphabetical') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <label class="cockpit-view__repository-filter">
          <IconSearch aria-hidden="true" />
          <input
            v-model="repositoryFilter"
            type="search"
            :placeholder="$t('surface.cockpitView.filterRepositories')"
            :aria-label="$t('surface.cockpitView.filterRepositories')"
          />
        </label>
        <div v-if="workBacklog" class="cockpit-view__repositories">
          <p v-if="filteredRepositories.length === 0" class="cockpit-view__repositories-empty"> {{ $t('surface.cockpitView.noRepositoriesFound') }} </p>
          <div
            v-for="repository in filteredRepositories"
            :key="repository.id"
          >
            <button
              type="button"
              :title="repository.name"
              :aria-pressed="workBacklog.selectedRepositoryId === repository.id"
              @click="selectRepository(repository.id)"
            >
              <IconFolder aria-hidden="true" />
              <span>{{ repository.name }}</span>
            </button>
            <a
              class="cockpit-view__repository-link"
              :href="repository.url"
              target="_blank"
              rel="noreferrer"
              :aria-label="$t('dynamic.cockpit.openRepository', { repository: repository.name })"
              :title="$t('dynamic.cockpit.openRepository', { repository: repository.name })"
              @click.stop
            >
              <ExternalLinkIcon aria-hidden="true" />
            </a>
          </div>
        </div>

      </nav>
    </aside>

    <div class="cockpit-view__workspace">
      <header class="cockpit-view__header">
        <div class="cockpit-view__frame">
          <h1>{{ $t('surface.cockpitView.backlog') }}</h1>
          <div v-if="workBacklog" class="cockpit-view__summary" :aria-label="$t('surface.cockpitView.workSummaryFilters')">
            <button
              v-for="metric in summaryMetrics"
              :key="metric.id"
              type="button"
              :data-tone="metric.id"
              :aria-pressed="activeSummaryFilter === metric.filter"
              @click="selectSummaryMetric(metric)"
            >
              <span>{{ metric.label }}</span>
              <strong>{{ metric.count }}</strong>
            </button>
          </div>
        </div>
      </header>

      <CockpitWorkInbox
        v-if="workBacklog"
        :agents="agents"
        :active-view="activeWorkView"
        :assignments="workBacklog.assignments"
        :connection="workBacklog.connection"
        :error="workBacklog.error"
        :global-scope="workBacklog.globalScope"
        :items="workBacklog.items"
        :page="workBacklog.page"
        :page-loading="workBacklog.pageLoading"
        :page-size="workBacklog.pageSize"
        :repositories="workBacklog.repositories"
        :repository-icons="repositoryIcons"
        :search-query="searchQuery"
        :selected-assignee-login="workBacklog.selectedAssigneeLogin ?? null"
        :selected-repository-id="workBacklog.selectedRepositoryId"
        :selected-tag-name="workBacklog.selectedTagName ?? null"
        :teams="teams"
        :default-team-id="defaultTeamId"
        :start-work-action="startWorkItemsAction"
        :status="workBacklog.status"
        :status-filter="activeSummaryFilter"
        :total-items="workBacklog.totalItems"
        @change-page="emit('change-work-items-page', $event)"
        @refresh="emit('refresh-work-items', $event)"
        @select-global-scope="emit('select-global-scope', $event)"
        @select-assignee="emit('select-work-assignee', $event)"
        @select-assigned-agent="selectAssignedAgent"
        @select-repository="emit('select-work-repository', $event)"
        @select-tag="emit('select-work-tag', $event)"
        @update-active-view="selectWorkView"
        @update-search-query="searchQuery = $event"
      />

      <div v-else class="cockpit-view__empty"> {{ $t('surface.cockpitView.connectAWorkProviderToBuildYourOperatorInbox') }} </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { computed, ref } from 'vue';
import { IconChevronDown, IconFolder, IconSearch } from '@tabler/icons-vue';
import type { Agent, Team, WorkBacklogAssignment, WorkIntegrationConnection, WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import { ExternalLinkIcon } from '../shared/icons/app-icons';
import CockpitWorkInbox from './CockpitWorkInbox.vue';

type CockpitWorkBacklog = {
  assignments: Record<string, WorkBacklogAssignment>;
  connection: WorkIntegrationConnection;
  error: string | null;
  globalScope: 'assignedToMe' | 'all' | null;
  items: WorkItem[];
  page?: number;
  pageLoading?: boolean;
  pageSize?: number;
  repositories: WorkRepository[];
  selectedAssigneeLogin?: string | null;
  selectedRepositoryId: string | null;
  selectedTagName?: string | null;
  status: 'notLoaded' | 'loading' | 'loaded' | 'error';
  totalItems?: number;
};

type WorkItemAssignmentIntent = { item: WorkItem; teamId?: string };
type InboxView = 'all' | 'backlog' | 'wip' | 'focus';
type RepositorySortMode = 'recent' | 'alphabetical';
type SummaryFilter = 'inProgress' | 'blocked' | 'readyForReview';
type SummaryMetric = { count: number; filter: SummaryFilter; id: 'working' | 'blocked' | 'review'; label: string; view: InboxView };

const props = defineProps<{
  agents: Agent[];
  repositoryIcons?: Record<string, string>;
  teams: Team[];
  defaultTeamId?: string | null;
  startWorkItemsAction: (input: { action: 'investigate' | 'fix'; items: WorkItem[]; teamId: string }) => Promise<void>;
  workBacklog?: CockpitWorkBacklog | null;
}>();

const repositoryIcons = computed(() => props.repositoryIcons ?? {});

const startWorkItemsAction = props.startWorkItemsAction;

const emit = defineEmits<{
  'assign-work-item-to-new-agent': [intent: WorkItemAssignmentIntent];
  'assign-work-item': [payload: { agentId: string; item: WorkItem }];
  'refresh-work-items': [repositoryId: string | null];
  'change-work-items-page': [page: number];
  'select-global-scope': [scope: 'assignedToMe' | 'all'];
  'select-work-repository': [repositoryId: string | null];
  'select-work-assignee': [assigneeLogin: string | null];
  'select-work-tag': [tagName: string | null];
  'select-agent': [payload: { agentId: string; teamId: string }];
}>();

const agentsById = computed(() => new Map(props.agents.map((agent) => [agent.id, agent])));
const searchQuery = ref('');
const repositoryFilter = ref('');
const activeWorkView = ref<InboxView>('focus');
const activeSummaryFilter = ref<SummaryFilter | null>(null);
const repositorySortMode = ref<RepositorySortMode>('recent');
const repositorySortLabel = computed(() => repositorySortMode.value === 'recent' ? translate('surface.cockpitView.recent') : 'A–Z');
const repositorySortDescription = computed(() => repositorySortMode.value === 'recent' ? 'recent activity' : 'name');
const sortedRepositories = computed(() => [...(props.workBacklog?.repositories ?? [])].sort((left, right) => {
  if (repositorySortMode.value === 'alphabetical') {
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
  }
  const activity = repositoryActivityAt(right).localeCompare(repositoryActivityAt(left));
  return activity || left.name.localeCompare(right.name);
}));
const filteredRepositories = computed(() => {
  const query = repositoryFilter.value.trim().toLocaleLowerCase();
  if (!query) return sortedRepositories.value;
  return sortedRepositories.value.filter((repository) => (
    `${repository.owner}/${repository.name}`.toLocaleLowerCase().includes(query)
  ));
});
const visibleAssignments = computed(() => (props.workBacklog?.items ?? [])
  .map((item) => props.workBacklog?.assignments[workItemAssignmentKey(item)])
  .filter((assignment): assignment is WorkBacklogAssignment => Boolean(assignment)));
const workSummary = computed(() => {
  const assignments = visibleAssignments.value;
  return {
    working: assignments.filter((assignment) => assignment.status === 'inProgress').length,
    blocked: assignments.filter((assignment) => assignment.status === 'blocked').length,
    review: assignments.filter((assignment) => assignment.status === 'readyForReview').length,
    wip: assignments.length,
  };
});
const summaryMetrics = computed<SummaryMetric[]>(() => [
  { id: 'working', label: translate('surface.cockpitView.working'), count: workSummary.value.working, filter: 'inProgress', view: 'wip' },
  { id: 'blocked', label: translate('surface.cockpitView.blocked'), count: workSummary.value.blocked, filter: 'blocked', view: 'focus' },
  { id: 'review', label: translate('surface.cockpitView.readyForReview'), count: workSummary.value.review, filter: 'readyForReview', view: 'focus' },
]);
function selectAssignedAgent(agentId: string): void {
  const agent = agentsById.value.get(agentId);
  if (agent?.teamId) emit('select-agent', { agentId, teamId: agent.teamId });
}

function selectRepository(repositoryId: string | null): void {
  emit('select-work-repository', repositoryId);
}

function selectRepositorySortMode(mode: RepositorySortMode): void {
  repositorySortMode.value = mode;
}

function selectSummaryMetric(metric: SummaryMetric): void {
  activeWorkView.value = metric.view;
  activeSummaryFilter.value = metric.filter;
}

function repositoryActivityAt(repository: WorkRepository): string {
  return repository.workItemsUpdatedAt ?? '';
}

function selectWorkView(view: InboxView): void {
  activeWorkView.value = view;
  activeSummaryFilter.value = null;
}
</script>

<style scoped>
.cockpit-view {
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  display: flex;
  color: var(--color-text);
  background: var(--color-shell-main);
}

.cockpit-view__navigation {
  width: 320px;
  min-height: 0;
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--space-24) var(--space-12) var(--space-16);
  border-right: 1px solid var(--color-border);
  background: var(--color-shell-sidebar);
}

.cockpit-view__repository-filter {
  height: 30px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  margin: calc(-1 * var(--space-2)) var(--space-6) 0;
  padding: 0 var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.cockpit-view__repository-filter svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.cockpit-view__repository-filter input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
}

.cockpit-view__repository-filter:focus-within {
  border-color: color-mix(
    in srgb,
    var(--color-primary) 55%,
    var(--color-border)
  );
}

.cockpit-view__navigation nav {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.cockpit-view__navigation-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
}

.cockpit-view__navigation-section strong {
  font-weight: var(--font-weight-semibold);
}

.cockpit-view__repository-sort {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  color: var(--color-text-muted);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-12);
  line-height: var(--line-height-20);
  cursor: pointer;
}

.cockpit-view__repository-sort:hover {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.cockpit-view__repository-sort svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.cockpit-view__repositories {
  min-height: 0;
  flex: 1;
  display: grid;
  align-content: start;
  gap: var(--space-2);
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding: 0 var(--space-2);
  padding-bottom: var(--space-6);
}

.cockpit-view__repositories-empty {
  margin: var(--space-8) var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.cockpit-view__repositories > div {
  min-width: 0;
  min-height: 36px;
  display: flex;
  align-items: center;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
}

.cockpit-view__repositories > div > button:first-child {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  overflow: hidden;
  border: 0;
  border-radius: var(--radius-md);
  padding: var(--space-4) var(--space-6);
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
  text-align: left;
  cursor: pointer;
}

.cockpit-view__repositories > div > button:first-child svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.cockpit-view__repositories > div > button:first-child span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cockpit-view__repositories > div:hover,
.cockpit-view__repositories > div:has(button[aria-pressed="true"]) {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.cockpit-view__repositories > div:has(button[aria-pressed="true"]) {
  border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
  background: var(--color-primary-container);
}

.cockpit-view__repositories > div > button[aria-pressed="true"] {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

.cockpit-view__repositories > div > button[aria-pressed="true"] svg {
  color: var(--color-primary);
}

.cockpit-view__repository-link {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  display: grid;
  place-items: center;
  margin-right: var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  opacity: 0;
}

.cockpit-view__repositories > div:hover .cockpit-view__repository-link,
.cockpit-view__repository-link:focus-visible {
  opacity: 1;
}

.cockpit-view__repository-link:hover {
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.cockpit-view__repository-link svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.cockpit-view__workspace {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.cockpit-view__frame {
  width: min(100%, 1440px);
  margin: 0 auto;
}

.cockpit-view__header {
  box-sizing: border-box;
  display: flex;
  min-height: 168px;
  padding: var(--space-8) var(--space-16);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

.cockpit-view__header .cockpit-view__frame {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.cockpit-view__header h1 {
  margin: 0;
  font-size: var(--font-size-28);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-32);
  letter-spacing: -0.02em;
}

.cockpit-view__empty {
  margin: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.cockpit-view__summary {
  width: min(100%, 640px);
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-8);
  margin-top: var(--space-8);
}

.cockpit-view__summary button {
  min-height: 82px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  border: 1px solid
    color-mix(in srgb, var(--metric-color) 30%, var(--color-border));
  border-radius: var(--radius-lg);
  padding: var(--space-8);
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--metric-color) 5%, var(--color-surface));
  font: inherit;
  font-weight: var(--font-weight-medium);
  text-align: left;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.cockpit-view__summary button:hover {
  border-color: color-mix(
    in srgb,
    var(--metric-color) 55%,
    var(--color-border)
  );
  background: color-mix(in srgb, var(--metric-color) 9%, var(--color-surface));
}

.cockpit-view__summary button[aria-pressed="true"] {
  border-color: var(--metric-color);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--metric-color) 20%, transparent);
  background: color-mix(in srgb, var(--metric-color) 12%, var(--color-surface));
}

.cockpit-view__summary button > span {
  color: var(--color-text-muted);
  font-size: var(--font-size-11);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
}

.cockpit-view__summary strong {
  color: var(--metric-color);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-28);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-32);
  font-variant-numeric: tabular-nums;
}

.cockpit-view__summary button[data-tone="working"] {
  --metric-color: var(--color-success);
}

.cockpit-view__summary button[data-tone="blocked"] {
  --metric-color: var(--color-warning);
}

.cockpit-view__summary button[data-tone="review"] {
  --metric-color: var(--color-primary);
}

@media (max-width: 1050px) {
  .cockpit-view__navigation {
    width: 204px;
    flex-basis: 204px;
  }
}

@media (max-width: 820px) {
  .cockpit-view__navigation {
    display: none;
  }
}
</style>
