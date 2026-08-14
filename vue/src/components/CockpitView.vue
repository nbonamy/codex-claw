<template>
  <section class="cockpit-view" aria-label="Cockpit">
    <aside class="cockpit-view__navigation" aria-label="Cockpit navigation">
      <label class="cockpit-view__search">
        <IconSearch aria-hidden="true" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="search"
          placeholder="Search"
          aria-label="Search Cockpit work"
        />
        <kbd>⌘K</kbd>
      </label>

      <nav>
        <button
          class="cockpit-view__navigation-item"
          :class="{ 'cockpit-view__navigation-item--active': activeSection === 'backlog' }"
          type="button"
          :aria-current="activeSection === 'backlog' ? 'page' : undefined"
          @click="showBacklog"
        >
          <BacklogIcon aria-hidden="true" />
          Backlog
        </button>
        <button
          class="cockpit-view__navigation-item"
          :class="{ 'cockpit-view__navigation-item--active': activeSection === 'agents' }"
          type="button"
          :aria-current="activeSection === 'agents' ? 'page' : undefined"
          @click="activeSection = 'agents'"
        >
          <IconUser aria-hidden="true" />
          Agents
          <span>{{ agents.length }}</span>
        </button>

        <div class="cockpit-view__navigation-section">
          <strong>Repositories</strong>
        </div>
        <div v-if="workBacklog" class="cockpit-view__repositories">
          <div
            v-for="repository in recentRepositories"
            :key="repository.id"
          >
            <button
              type="button"
              :aria-pressed="activeSection === 'backlog' && workBacklog.selectedRepositoryId === repository.id"
              @click="selectRepository(repository.id)"
            >
              <IconFolder aria-hidden="true" />
              <span>{{ repository.name }}</span>
            </button>
            <button
              class="cockpit-view__repository-launch"
              type="button"
              :aria-label="`Start agent in ${repository.name}`"
              :title="`Start agent in ${repository.name}`"
              @click="emit('add-agent-for-repository', repository)"
            >
              <PlayerPlayIcon aria-hidden="true" />
            </button>
          </div>
        </div>

      </nav>
    </aside>

    <div class="cockpit-view__workspace">
      <header class="cockpit-view__header" :class="{ 'cockpit-view__header--agents': activeSection === 'agents' }">
        <div class="cockpit-view__frame">
          <h1>{{ activeSection === 'backlog' ? 'Cockpit' : 'Agents' }}</h1>
          <div v-if="activeSection === 'backlog' && workBacklog" class="cockpit-view__summary" aria-label="Work summary filters">
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
        v-if="activeSection === 'backlog' && workBacklog"
        :agents="agents"
        :active-view="activeWorkView"
        :assignments="workBacklog.assignments"
        :connection="workBacklog.connection"
        :error="workBacklog.error"
        :global-scope="workBacklog.globalScope"
        :items="workBacklog.items"
        :repositories="workBacklog.repositories"
        :search-query="searchQuery"
        :selected-assignee-login="workBacklog.selectedAssigneeLogin ?? null"
        :selected-repository-id="workBacklog.selectedRepositoryId"
        :selected-tag-name="workBacklog.selectedTagName ?? null"
        :teams="teams"
        :default-team-id="defaultTeamId"
        :start-work-action="startWorkItemsAction"
        :status="workBacklog.status"
        :status-filter="activeSummaryFilter"
        @focus-search="focusSearch"
        @refresh="emit('refresh-work-items', $event)"
        @select-global-scope="emit('select-global-scope', $event)"
        @remove-assignment="emit('remove-work-item-assignment', $event)"
        @select-assignee="emit('select-work-assignee', $event)"
        @select-assigned-agent="selectAssignedAgent"
        @select-repository="emit('select-work-repository', $event)"
        @select-tag="emit('select-work-tag', $event)"
        @update-active-view="selectWorkView"
        @update-search-query="searchQuery = $event"
      />

      <CockpitAgentsView
        v-else-if="activeSection === 'agents'"
        :agents="agents"
        :bench="bench"
        :bench-by-team-id="benchByTeamId"
        :forkable-agent-ids="forkableAgentIds"
        :teams="teams"
        @add-agent="emit('add-agent', $event)"
        @close-agent="emit('close-agent', $event)"
        @deploy-bench-template="emit('deploy-bench-template', $event)"
        @duplicate-agent="emit('duplicate-agent', $event)"
        @edit-agent="emit('edit-agent', $event)"
        @fork-agent="emit('fork-agent', $event)"
        @move-agent-to-team="emit('move-agent-to-team', $event)"
        @prompt-agent="emit('prompt-agent', $event)"
        @remove-bench-template="emit('remove-bench-template', $event)"
        @restart-agent="emit('restart-agent', $event)"
        @save-agent-to-bench="emit('save-agent-to-bench', $event)"
        @select-agent="emit('select-agent', $event)"
        @select-team="emit('select-team', $event)"
      />

      <div v-else class="cockpit-view__empty">
        Connect a work provider to build your operator inbox.
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { IconFolder, IconSearch, IconUser } from '@tabler/icons-vue';
import type { Agent, BenchTemplate, DeployBenchTemplateInput, Team, WorkBacklogAssignment, WorkIntegrationConnection, WorkItem, WorkRepository } from '@codex-claw/core/contracts';
import { workItemAssignmentKey } from '@codex-claw/core/work-assignments';
import { BacklogIcon, PlayerPlayIcon } from '../shared/icons/app-icons';
import CockpitAgentsView from './CockpitAgentsView.vue';
import CockpitWorkInbox from './CockpitWorkInbox.vue';

type CockpitWorkBacklog = {
  assignments: Record<string, WorkBacklogAssignment>;
  connection: WorkIntegrationConnection;
  error: string | null;
  globalScope: 'assignedToMe' | 'all' | null;
  items: WorkItem[];
  repositories: WorkRepository[];
  selectedAssigneeLogin?: string | null;
  selectedRepositoryId: string | null;
  selectedTagName?: string | null;
  status: 'notLoaded' | 'loading' | 'loaded' | 'error';
};

type WorkItemAssignmentIntent = { item: WorkItem; teamId?: string };
type InboxView = 'all' | 'backlog' | 'wip' | 'focus';
type CockpitSection = 'backlog' | 'agents';
type SummaryFilter = 'inProgress' | 'blocked' | 'readyForReview';
type SummaryMetric = { count: number; filter: SummaryFilter; id: 'working' | 'blocked' | 'review'; label: string; view: InboxView };

const props = defineProps<{
  agents: Agent[];
  bench?: BenchTemplate[];
  benchByTeamId?: Record<string, BenchTemplate[]>;
  forkableAgentIds?: string[];
  teams: Team[];
  defaultTeamId?: string | null;
  startWorkItemsAction: (input: { action: 'investigate' | 'fix'; items: WorkItem[]; teamId: string }) => Promise<void>;
  workBacklog?: CockpitWorkBacklog | null;
}>();

const startWorkItemsAction = props.startWorkItemsAction;

const emit = defineEmits<{
  'add-agent': [teamId: string];
  'add-agent-for-repository': [repository: WorkRepository];
  'assign-work-item-to-bench-agent': [intent: WorkItemAssignmentIntent];
  'assign-work-item-to-new-agent': [intent: WorkItemAssignmentIntent];
  'assign-work-item': [payload: { agentId: string; item: WorkItem }];
  'close-agent': [agentId: string];
  'deploy-bench-template': [input: DeployBenchTemplateInput];
  'duplicate-agent': [agentId: string];
  'fork-agent': [agentId: string];
  'edit-agent': [agentId: string];
  'move-agent-to-team': [payload: { agentId: string; teamId: string }];
  'prompt-agent': [payload: { agentId: string; prompt: string }];
  'refresh-work-items': [repositoryId: string | null];
  'select-global-scope': [scope: 'assignedToMe' | 'all'];
  'remove-bench-template': [input: { templateId: string; teamId?: string }];
  'remove-work-item-assignment': [item: WorkItem];
  'restart-agent': [agentId: string];
  'save-agent-to-bench': [agentId: string];
  'select-work-repository': [repositoryId: string | null];
  'select-work-assignee': [assigneeLogin: string | null];
  'select-work-tag': [tagName: string | null];
  'select-agent': [payload: { agentId: string; teamId: string }];
  'select-team': [teamId: string];
}>();

const agentsById = computed(() => new Map(props.agents.map((agent) => [agent.id, agent])));
const activeSection = ref<CockpitSection>('backlog');
const searchInput = ref<HTMLInputElement | null>(null);
const searchQuery = ref('');
const activeWorkView = ref<InboxView>('focus');
const activeSummaryFilter = ref<SummaryFilter | null>(null);
const sortedRepositories = computed(() => [...(props.workBacklog?.repositories ?? [])].sort((left, right) => {
  const activity = repositoryActivityAt(right).localeCompare(repositoryActivityAt(left));
  return activity || left.name.localeCompare(right.name);
}));
const recentRepositories = computed(() => {
  const recent = sortedRepositories.value.slice(0, 10);
  const selectedRepositoryId = props.workBacklog?.selectedRepositoryId;
  if (!selectedRepositoryId || recent.some((repository) => repository.id === selectedRepositoryId)) return recent;
  const selected = sortedRepositories.value.find((repository) => repository.id === selectedRepositoryId);
  return selected ? [selected, ...recent.slice(0, 9)] : recent;
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
  { id: 'working', label: 'working', count: workSummary.value.working, filter: 'inProgress', view: 'wip' },
  { id: 'blocked', label: 'blocked', count: workSummary.value.blocked, filter: 'blocked', view: 'focus' },
  { id: 'review', label: 'ready for review', count: workSummary.value.review, filter: 'readyForReview', view: 'focus' },
]);
function selectAssignedAgent(agentId: string): void {
  const agent = agentsById.value.get(agentId);
  if (agent?.teamId) emit('select-agent', { agentId, teamId: agent.teamId });
}

function showBacklog(): void {
  activeSection.value = 'backlog';
  selectRepository(null);
}

function selectRepository(repositoryId: string | null): void {
  activeSection.value = 'backlog';
  emit('select-work-repository', repositoryId);
}

function selectSummaryMetric(metric: SummaryMetric): void {
  activeWorkView.value = metric.view;
  activeSummaryFilter.value = metric.filter;
}

function repositoryActivityAt(repository: WorkRepository): string {
  const workItemActivity = (props.workBacklog?.items ?? [])
    .filter((item) => item.repositoryId === repository.id)
    .reduce((latest, item) => item.updatedAt > latest ? item.updatedAt : latest, '');
  return workItemActivity > (repository.updatedAt ?? '') ? workItemActivity : repository.updatedAt ?? '';
}

function selectWorkView(view: InboxView): void {
  activeWorkView.value = view;
  activeSummaryFilter.value = null;
}

async function focusSearch(): Promise<void> {
  await nextTick();
  searchInput.value?.focus();
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
  width: 248px;
  flex: 0 0 248px;
  padding: var(--space-16) var(--space-12);
  border-right: 1px solid var(--color-border);
  background: var(--color-shell-sidebar);
}

.cockpit-view__search {
  height: 38px;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  margin-bottom: var(--space-16);
  padding: 0 var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.cockpit-view__search svg,
.cockpit-view__navigation-item svg {
  width: var(--icon-md);
  height: var(--icon-md);
  flex: 0 0 auto;
}

.cockpit-view__search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-20);
}

.cockpit-view__search kbd {
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: var(--font-size-11);
}

.cockpit-view__navigation nav {
  display: grid;
  gap: var(--space-4);
}

.cockpit-view__navigation-section {
  margin-top: var(--space-12);
  border-top: 1px solid var(--color-border);
  padding: var(--space-12) var(--space-6) var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
}

.cockpit-view__navigation-section strong {
  font-weight: var(--font-weight-semibold);
}

.cockpit-view__navigation-item {
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: var(--space-8);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  padding: 0 var(--space-8);
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-20);
  text-align: left;
  cursor: pointer;
}

.cockpit-view__navigation-item > span {
  min-width: 24px;
  margin-left: auto;
  border-radius: var(--radius-full);
  padding: 2px var(--space-4);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  font-size: var(--font-size-11);
  text-align: center;
}

.cockpit-view__navigation-item:hover:not(:disabled) {
  background: var(--color-surface-low);
}

.cockpit-view__navigation-item--active {
  border-color: color-mix(in srgb, var(--color-primary) 35%, transparent);
  color: var(--color-primary);
  background: var(--color-primary-container);
  font-weight: var(--font-weight-semibold);
}

.cockpit-view__navigation-item:disabled {
  opacity: 0.45;
  cursor: default;
}

.cockpit-view__repositories {
  display: grid;
  gap: var(--space-2);
  padding: 0 var(--space-2);
  padding-bottom: var(--space-6);
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

.cockpit-view__repository-launch {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  display: grid;
  place-items: center;
  margin-right: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 0;
  color: var(--color-text-muted);
  background: var(--color-surface);
  cursor: pointer;
  opacity: 0;
}

.cockpit-view__repositories > div:hover .cockpit-view__repository-launch,
.cockpit-view__repository-launch:focus-visible {
  opacity: 1;
}

.cockpit-view__repository-launch:hover {
  border-color: color-mix(
    in srgb,
    var(--color-primary) 45%,
    var(--color-border)
  );
  color: var(--color-primary);
  background: var(--color-primary-container);
}

.cockpit-view__repository-launch svg {
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

.cockpit-view__header--agents {
  min-height: 76px;
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
