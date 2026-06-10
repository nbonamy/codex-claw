<template>
  <section
    class="cockpit-view"
    aria-label="Cockpit"
  >
    <header class="cockpit-view__header">
      <div class="cockpit-view__title-block">
        <h1>Cockpit</h1>
      </div>

      <div class="cockpit-view__toolbar">
        <div
          class="cockpit-view__summary"
          aria-label="Agent status summary"
        >
          <span
            v-for="item in statusSummary"
            :key="item.status"
            class="cockpit-view__summary-item"
          >
            <span
              class="cockpit-view__status-dot"
              :data-status="item.status"
              aria-hidden="true"
            />
            {{ item.count }} {{ item.label }}
          </span>
        </div>
      </div>
    </header>

    <div class="cockpit-view__content">
      <WorkBacklogPanel
        v-if="workBacklog"
        :connection="workBacklog.connection"
        :error="workBacklog.error"
        :items="workBacklog.items"
        :repositories="workBacklog.repositories"
        :selected-assignee-login="workBacklog.selectedAssigneeLogin ?? null"
        :selected-repository-id="workBacklog.selectedRepositoryId"
        :selected-tag-name="workBacklog.selectedTagName ?? null"
        :status="workBacklog.status"
        :assigned-agents-by-work-item-key="assignedAgentsByWorkItemKey"
        :assignments="workBacklog.assignments"
        :can-assign-to-bench="bench.length > 0"
        @assign-to-bench-agent="emit('assign-work-item-to-bench-agent', { item: $event })"
        @assign-to-new-agent="emit('assign-work-item-to-new-agent', { item: $event })"
        @refresh="emit('refresh-work-items', $event)"
        @remove-assignment="emit('remove-work-item-assignment', $event)"
        @select-assigned-agent="selectAssignedAgent"
        @select-assignee="emit('select-work-assignee', $event)"
        @select-repository="emit('select-work-repository', $event)"
        @select-tag="emit('select-work-tag', $event)"
        @work-item-drag-end="clearDraggedWorkItem"
        @work-item-drag-start="draggedWorkItem = $event"
      />

      <div class="cockpit-view__sections">
        <section
          v-for="section in teamSections"
          :key="section.team.id"
          class="cockpit-view__team"
        >
          <header class="cockpit-view__team-header">
            <span
              class="cockpit-view__team-marker"
              :style="{ backgroundColor: section.team.color ?? defaultTeamColor }"
              aria-hidden="true"
            />
            <button
              class="cockpit-view__team-title"
              type="button"
              @click="emit('select-team', section.team.id)"
            >
              {{ section.team.name }}
            </button>
            <div class="cockpit-view__team-summary">
              <span
                v-for="item in section.statusSummary"
                :key="item.status"
                class="cockpit-view__summary-item"
              >
                <span
                  class="cockpit-view__status-dot"
                  :data-status="item.status"
                  aria-hidden="true"
                />
                {{ item.count }} {{ item.label }}
              </span>
            </div>
            <NewAgentButton
              v-if="section.showHeaderAdd"
              class="cockpit-view__header-add"
              label="Add Agent"
              size="small"
              tone="ghost"
              :bench="bench"
              @deploy-bench-template="emit('deploy-bench-template', { templateId: $event, teamId: section.team.id })"
              @new-agent="emit('add-agent', section.team.id)"
              @remove-bench-template="emit('remove-bench-template', $event)"
            />
          </header>

          <p
            v-if="section.agents.length === 0"
            class="cockpit-view__empty-team"
          >
            No agents
          </p>

          <div
            :ref="(element) => setGridRef(section.team.id, element)"
            class="cockpit-view__grid"
          >
            <CockpitAgentCard
              v-for="agent in section.agents"
              :key="agent.id"
              :agent="agent"
              :dragged-work-item="draggedWorkItem"
              :drop-target="dropTargetAgentId === agent.id"
              @assign-work-item="assignDraggedWorkItemToAgent"
              @clear-dragged-work-item="clearDraggedWorkItem"
              @drop-target-enter="dropTargetAgentId = $event"
              @drop-target-leave="leaveAgentDropTarget"
              @open-agent-menu="openAgentMenu"
              @prompt="emit('prompt-agent', $event)"
              @select="emit('select-agent', { agentId: agent.id, teamId: section.team.id })"
            />

            <CockpitAddAgentTile
              v-if="section.showGridAdd"
              :bench="bench"
              :dragged-work-item="draggedWorkItem"
              :team-id="section.team.id"
              :team-name="section.team.name"
              @assign-to-bench-agent="assignDraggedWorkItemToBenchAgent"
              @assign-to-new-agent="assignDraggedWorkItemToNewAgent"
              @deploy-bench-template="emit('deploy-bench-template', $event)"
              @new-agent="emit('add-agent', $event)"
              @remove-bench-template="emit('remove-bench-template', $event)"
            />
          </div>
        </section>
      </div>
    </div>

    <AgentContextMenu
      v-if="contextMenuAgent"
      :move-targets="contextMenuMoveTargets"
      :x="contextMenuPosition.x"
      :y="contextMenuPosition.y"
      @action="emitContextAgentAction"
      @move-agent-to-team="emitContextAgentMove"
      @close="closeAgentMenu"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import type { Agent, AgentStatus, BenchTemplate, DeployBenchTemplateInput, Team, WorkBacklogAssignment, WorkIntegrationConnection, WorkItem, WorkRepository } from '../../shared/contracts';
import { defaultTeamColor } from '../../shared/team-colors';
import { assignedAgentsByWorkItemKey as collectAssignedAgentsByWorkItemKey } from '../../shared/work-assignments';
import AgentContextMenu from './AgentContextMenu.vue';
import type { AgentContextMenuAction } from './AgentContextMenu.vue';
import CockpitAddAgentTile from './CockpitAddAgentTile.vue';
import CockpitAgentCard from './CockpitAgentCard.vue';
import NewAgentButton from './NewAgentButton.vue';
import WorkBacklogPanel from './WorkBacklogPanel.vue';

type StatusSummaryItem = {
  status: AgentStatus['type'];
  count: number;
  label: string;
};

type TeamSection = {
  agents: Agent[];
  showGridAdd: boolean;
  showHeaderAdd: boolean;
  statusSummary: StatusSummaryItem[];
  team: Team;
};

type CockpitWorkBacklog = {
  assignments: Record<string, WorkBacklogAssignment>;
  connection: WorkIntegrationConnection;
  error: string | null;
  items: WorkItem[];
  repositories: WorkRepository[];
  selectedAssigneeLogin?: string | null;
  selectedRepositoryId: string | null;
  selectedTagName?: string | null;
  status: 'notLoaded' | 'loading' | 'loaded' | 'error';
};

type WorkItemAssignmentIntent = {
  item: WorkItem;
  teamId?: string;
};

const DEFAULT_GRID_COLUMNS = 3;

const props = defineProps<{
  agents: Agent[];
  bench?: BenchTemplate[];
  teams: Team[];
  workBacklog?: CockpitWorkBacklog | null;
}>();

const emit = defineEmits<{
  'add-agent': [teamId: string];
  'assign-work-item-to-bench-agent': [intent: WorkItemAssignmentIntent];
  'assign-work-item-to-new-agent': [intent: WorkItemAssignmentIntent];
  'assign-work-item': [payload: { agentId: string; item: WorkItem }];
  'close-agent': [agentId: string];
  'deploy-bench-template': [input: DeployBenchTemplateInput];
  'duplicate-agent': [agentId: string];
  'edit-agent': [agentId: string];
  'move-agent-to-team': [payload: { agentId: string; teamId: string }];
  'prompt-agent': [payload: { agentId: string; prompt: string }];
  'refresh-work-items': [repositoryId: string | null];
  'remove-bench-template': [templateId: string];
  'remove-work-item-assignment': [item: WorkItem];
  'restart-agent': [agentId: string];
  'save-agent-to-bench': [agentId: string];
  'select-work-repository': [repositoryId: string | null];
  'select-work-assignee': [assigneeLogin: string | null];
  'select-work-tag': [tagName: string | null];
  'select-agent': [payload: { agentId: string; teamId: string }];
  'select-team': [teamId: string];
}>();

const draggedWorkItem = ref<WorkItem | null>(null);
const dropTargetAgentId = ref<string | null>(null);
const contextMenuAgentId = ref<string | null>(null);
const contextMenuPosition = ref({ x: 0, y: 0 });
const columnsByTeam = ref<Record<string, number>>({});
const gridElements = new Map<string, HTMLElement>();
let resizeObserver: ResizeObserver | null = null;
const bench = computed(() => props.bench ?? []);

const agentsById = computed(() => new Map(props.agents.map((agent) => [agent.id, agent])));
const contextMenuAgent = computed(() => (
  contextMenuAgentId.value ? agentsById.value.get(contextMenuAgentId.value) ?? null : null
));
const contextMenuMoveTargets = computed(() => {
  const agent = contextMenuAgent.value;
  if (!agent) {
    return [];
  }

  return props.teams.filter((team) => team.id !== agent.teamId);
});
const assignedAgentsByWorkItemKey = computed<Record<string, Agent>>(() => (
  collectAssignedAgentsByWorkItemKey(props.agents, props.workBacklog?.assignments ?? {})
));
const teamSections = computed<TeamSection[]>(() => props.teams.map((team) => {
  const agents = team.agentIds
    .map((agentId) => agentsById.value.get(agentId))
    .filter((agent): agent is Agent => Boolean(agent));

  const columns = columnsForTeam(team.id);

  return {
    agents,
    showGridAdd: shouldShowGridAdd(agents.length, columns),
    showHeaderAdd: shouldShowHeaderAdd(agents.length, columns),
    statusSummary: statusCounts(agents),
    team,
  };
}));
const allVisibleAgents = computed(() => teamSections.value.flatMap((section) => section.agents));
const statusSummary = computed(() => statusCounts(allVisibleAgents.value));

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const teamId = entry.target instanceof HTMLElement ? entry.target.dataset.teamId : undefined;
        if (teamId) {
          measureGridColumns(teamId, entry.target as HTMLElement);
        }
      }
    });
    for (const element of gridElements.values()) {
      resizeObserver.observe(element);
    }
  }

  void nextTick(measureAllGrids);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  gridElements.clear();
});

watch(() => props.teams.map((team) => team.id).join('\0'), () => {
  void nextTick(measureAllGrids);
});

function setGridRef(teamId: string, element: Element | ComponentPublicInstance | null): void {
  const htmlElement = resolvedElement(element);
  const previous = gridElements.get(teamId);
  if (previous && previous !== htmlElement) {
    resizeObserver?.unobserve(previous);
  }

  if (!htmlElement) {
    gridElements.delete(teamId);
    return;
  }

  htmlElement.dataset.teamId = teamId;
  gridElements.set(teamId, htmlElement);
  resizeObserver?.observe(htmlElement);
  measureGridColumns(teamId, htmlElement);
}

function resolvedElement(element: Element | ComponentPublicInstance | null): HTMLElement | null {
  if (element instanceof HTMLElement) {
    return element;
  }

  const component = element as ComponentPublicInstance | null;
  return component?.$el instanceof HTMLElement ? component.$el : null;
}

function measureAllGrids(): void {
  for (const [teamId, element] of gridElements.entries()) {
    measureGridColumns(teamId, element);
  }
}

function measureGridColumns(teamId: string, element: HTMLElement): void {
  const styles = getComputedStyle(element);
  const tileWidth = cssPixelValue(styles.getPropertyValue('--cockpit-tile-width')) ?? 360;
  const gap = cssPixelValue(styles.columnGap) ?? 12;
  const width = element.clientWidth || element.getBoundingClientRect().width;
  const columns = width > 0
    ? Math.max(1, Math.floor((width + gap) / (tileWidth + gap)))
    : DEFAULT_GRID_COLUMNS;
  if (columnsByTeam.value[teamId] === columns) {
    return;
  }

  columnsByTeam.value = {
    ...columnsByTeam.value,
    [teamId]: columns,
  };
}

function cssPixelValue(value: string): number | null {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function columnsForTeam(teamId: string): number {
  return columnsByTeam.value[teamId] ?? DEFAULT_GRID_COLUMNS;
}

function shouldShowGridAdd(agentCount: number, columns: number): boolean {
  return agentCount === 0 || agentCount % columns !== 0;
}

function shouldShowHeaderAdd(agentCount: number, columns: number): boolean {
  return agentCount > 0 && agentCount % columns === 0;
}

function leaveAgentDropTarget(agentId: string): void {
  if (dropTargetAgentId.value === agentId) {
    dropTargetAgentId.value = null;
  }
}

function openAgentMenu(payload: { agentId: string; x: number; y: number }): void {
  contextMenuAgentId.value = payload.agentId;
  contextMenuPosition.value = {
    x: payload.x,
    y: payload.y,
  };
}

function emitContextAgentAction(action: AgentContextMenuAction): void {
  const agentId = contextMenuAgentId.value;
  if (!agentId) {
    return;
  }

  switch (action) {
    case 'close-agent':
      emit('close-agent', agentId);
      break;
    case 'duplicate-agent':
      emit('duplicate-agent', agentId);
      break;
    case 'edit-agent':
      emit('edit-agent', agentId);
      break;
    case 'restart-agent':
      emit('restart-agent', agentId);
      break;
    case 'save-agent-to-bench':
      emit('save-agent-to-bench', agentId);
      break;
  }
  closeAgentMenu();
}

function emitContextAgentMove(teamId: string): void {
  const agentId = contextMenuAgentId.value;
  if (!agentId) {
    return;
  }

  emit('move-agent-to-team', { agentId, teamId });
  closeAgentMenu();
}

function closeAgentMenu(): void {
  contextMenuAgentId.value = null;
}

function assignDraggedWorkItemToAgent(payload: { agentId: string; item: WorkItem }): void {
  emit('assign-work-item', payload);
  clearDraggedWorkItem();
}

function assignDraggedWorkItemToNewAgent(intent: WorkItemAssignmentIntent): void {
  emit('assign-work-item-to-new-agent', intent);
  clearDraggedWorkItem();
}

function assignDraggedWorkItemToBenchAgent(intent: WorkItemAssignmentIntent): void {
  emit('assign-work-item-to-bench-agent', intent);
  clearDraggedWorkItem();
}

function selectAssignedAgent(agentId: string): void {
  const agent = agentsById.value.get(agentId);
  if (agent?.teamId) {
    emit('select-agent', {
      agentId,
      teamId: agent.teamId,
    });
  }
}

function clearDraggedWorkItem(): void {
  draggedWorkItem.value = null;
  dropTargetAgentId.value = null;
}

function statusCounts(agents: Agent[]): StatusSummaryItem[] {
  const order: AgentStatus['type'][] = ['awaitingInput', 'working', 'starting', 'idle', 'error'];
  const counts = new Map<AgentStatus['type'], number>();
  for (const agent of agents) {
    counts.set(agent.status.type, (counts.get(agent.status.type) ?? 0) + 1);
  }

  return order
    .map((status) => ({
      status,
      count: counts.get(status) ?? 0,
      label: summaryLabel(status, counts.get(status) ?? 0),
    }))
    .filter((item) => item.count > 0);
}

function summaryLabel(status: AgentStatus['type'], count: number): string {
  switch (status) {
    case 'awaitingInput':
      return 'Awaiting Input';
    case 'working':
      return 'Working';
    case 'starting':
      return 'Starting';
    case 'idle':
      return 'Idle';
    case 'error':
      return count === 1 ? 'Error' : 'Errors';
  }
}
</script>

<style scoped>
.cockpit-view {
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--color-text);
  background: var(--color-shell-main);
}

.cockpit-view__header {
  min-height: var(--workbench-appbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  padding: 0 var(--space-16);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

.cockpit-view__title-block {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.cockpit-view h1 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
  text-transform: uppercase;
}

.cockpit-view__toolbar,
.cockpit-view__summary,
.cockpit-view__team-summary,
.cockpit-view__summary-item {
  display: flex;
  align-items: center;
}

.cockpit-view__toolbar {
  gap: var(--space-12);
  -webkit-app-region: no-drag;
}

.cockpit-view__summary,
.cockpit-view__team-summary {
  gap: var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.cockpit-view__summary-item {
  gap: var(--space-3);
  white-space: nowrap;
}

.cockpit-view__status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-success);
}

.cockpit-view__status-dot[data-status='working'],
.cockpit-view__status-dot[data-status='starting'] {
  background: var(--color-warning);
}

.cockpit-view__status-dot[data-status='awaitingInput'] {
  background: var(--color-warning);
}

.cockpit-view__status-dot[data-status='error'] {
  background: var(--color-error);
}

.cockpit-view__content {
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  overflow: hidden;
}

.cockpit-view__sections {
  width: min(100%, 1220px);
  min-width: 0;
  flex: 1 1 auto;
  display: grid;
  align-content: start;
  gap: var(--space-20);
  margin: 0 auto;
  padding: var(--space-24) var(--space-20) var(--space-24);
  overflow: auto;
}

.cockpit-view__team {
  display: grid;
  gap: var(--space-10);
}

.cockpit-view__team-header {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.cockpit-view__team-marker {
  width: 4px;
  height: 28px;
  border-radius: var(--radius-full);
}

.cockpit-view__team-title {
  min-width: 0;
  overflow: hidden;
  border: 0;
  padding: 0;
  color: var(--color-text);
  background: transparent;
  font-size: var(--font-size-20);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-28);
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.cockpit-view__team-title:hover {
  color: var(--color-primary);
}

.cockpit-view__team-title:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.cockpit-view__header-add {
  margin-left: auto;
}

.cockpit-view__empty-team {
  margin: 0;
  padding-left: var(--space-12);
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
}

.cockpit-view__grid {
  --cockpit-tile-width: 320px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--cockpit-tile-width)), var(--cockpit-tile-width)));
  gap: var(--space-12);
}

@media (max-width: 780px) {
  .cockpit-view__content {
    flex-direction: column;
    overflow: auto;
  }

  .cockpit-view__content :deep(.work-backlog-panel) {
    width: auto;
    min-width: 0;
    max-width: none;
    min-height: 220px;
    border-right: 0;
    border-bottom: 1px solid var(--color-border);
  }

  .cockpit-view__sections {
    overflow: visible;
  }

  .cockpit-view__header {
    align-items: flex-start;
    flex-direction: column;
    height: auto;
    padding-block: var(--space-8);
  }

  .cockpit-view__toolbar {
    width: 100%;
    align-items: flex-start;
    flex-direction: column;
    gap: var(--space-6);
  }

  .cockpit-view__team-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .cockpit-view__team-summary {
    width: 100%;
    padding-left: var(--space-12);
  }
}
</style>
