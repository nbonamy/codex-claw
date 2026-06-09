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
        :selected-repository-id="workBacklog.selectedRepositoryId"
        :status="workBacklog.status"
        :can-assign-to-bench="bench.length > 0"
        @assign-to-bench-agent="emit('assign-work-item-to-bench-agent', $event)"
        @assign-to-new-agent="emit('assign-work-item-to-new-agent', $event)"
        @refresh="emit('refresh-work-items', $event)"
        @select-repository="emit('select-work-repository', $event)"
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
            <article
              v-for="agent in section.agents"
              :key="agent.id"
              class="cockpit-view__agent-card"
              :class="{
                'cockpit-view__agent-card--drop-ready': draggedWorkItem && agentCanReceivePrompt(agent),
                'cockpit-view__agent-card--drop-target': dropTargetAgentId === agent.id,
              }"
              @click="emit('select-agent', { agentId: agent.id, teamId: section.team.id })"
              @dragenter="enterAgentDropTarget($event, agent)"
              @dragleave="leaveAgentDropTarget(agent)"
              @dragover="allowAgentDrop($event, agent)"
              @drop="dropWorkItem($event, agent)"
            >
              <header class="cockpit-view__agent-header">
                <AgentAvatar
                  :avatar="agent.avatar"
                  :name="agent.name"
                  size="lg"
                />
                <div class="cockpit-view__agent-title">
                  <strong>{{ agent.name }}</strong>
                  <span>{{ folderBasename(agent.folder) }}</span>
                </div>
                <span
                  class="cockpit-view__agent-state"
                  :data-status="agent.status.type"
                >
                  {{ agentStatusLabel(agent.status.type) }}
                </span>
              </header>

              <div class="cockpit-view__agent-body">
                <strong>{{ agentStatusText(agent) }}</strong>
                <span>{{ agent.backend }}</span>
              </div>

              <form
                class="cockpit-view__prompt"
                @click.stop
                @submit.prevent="submitPrompt(agent)"
              >
                <input
                  v-model="promptDrafts[agent.id]"
                  :disabled="!agentCanReceivePrompt(agent)"
                  :placeholder="agentCanReceivePrompt(agent) ? 'Send prompt...' : 'Working...'"
                  :aria-label="`Prompt ${agent.name}`"
                >
                <button
                  type="submit"
                  :disabled="!canSubmitPrompt(agent)"
                  :aria-label="`Send prompt to ${agent.name}`"
                >
                  <SendIcon aria-hidden="true" />
                </button>
              </form>
            </article>

            <div
              v-if="section.showGridAdd"
              class="cockpit-view__add-card"
            >
              <NewAgentButton
                class="cockpit-view__add-button"
                label="Add Agent"
                presentation="tile"
                tone="muted"
                :bench="bench"
                @deploy-bench-template="emit('deploy-bench-template', { templateId: $event, teamId: section.team.id })"
                @new-agent="emit('add-agent', section.team.id)"
                @remove-bench-template="emit('remove-bench-template', $event)"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import type { Agent, AgentStatus, BenchTemplate, DeployBenchTemplateInput, Team, WorkIntegrationConnection, WorkItem, WorkRepository } from '../../shared/contracts';
import { defaultTeamColor } from '../../shared/team-colors';
import { agentCanReceivePrompt, agentStatusLabel, agentStatusText, folderBasename } from '../shared/agent-display';
import { SendIcon } from '../shared/icons/app-icons';
import AgentAvatar from './AgentAvatar.vue';
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
  connection: WorkIntegrationConnection;
  error: string | null;
  items: WorkItem[];
  repositories: WorkRepository[];
  selectedRepositoryId: string | null;
  status: 'notLoaded' | 'loading' | 'loaded' | 'error';
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
  'assign-work-item-to-bench-agent': [item: WorkItem];
  'assign-work-item-to-new-agent': [item: WorkItem];
  'assign-work-item': [payload: { agentId: string; item: WorkItem }];
  'deploy-bench-template': [input: DeployBenchTemplateInput];
  'prompt-agent': [payload: { agentId: string; prompt: string }];
  'refresh-work-items': [repositoryId: string | null];
  'remove-bench-template': [templateId: string];
  'select-work-repository': [repositoryId: string | null];
  'select-agent': [payload: { agentId: string; teamId: string }];
  'select-team': [teamId: string];
}>();

const promptDrafts = ref<Record<string, string>>({});
const draggedWorkItem = ref<WorkItem | null>(null);
const dropTargetAgentId = ref<string | null>(null);
const columnsByTeam = ref<Record<string, number>>({});
const gridElements = new Map<string, HTMLElement>();
let resizeObserver: ResizeObserver | null = null;
const bench = computed(() => props.bench ?? []);

const agentsById = computed(() => new Map(props.agents.map((agent) => [agent.id, agent])));
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

function canSubmitPrompt(agent: Agent): boolean {
  return agentCanReceivePrompt(agent) && Boolean(promptDrafts.value[agent.id]?.trim());
}

function submitPrompt(agent: Agent): void {
  if (!canSubmitPrompt(agent)) {
    return;
  }

  const prompt = (promptDrafts.value[agent.id] ?? '').trim();
  promptDrafts.value[agent.id] = '';
  emit('prompt-agent', {
    agentId: agent.id,
    prompt,
  });
}

function allowAgentDrop(event: DragEvent, agent: Agent): void {
  if (!draggedWorkItem.value || !agentCanReceivePrompt(agent)) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

function enterAgentDropTarget(event: DragEvent, agent: Agent): void {
  if (!draggedWorkItem.value || !agentCanReceivePrompt(agent)) {
    return;
  }

  event.preventDefault();
  dropTargetAgentId.value = agent.id;
}

function leaveAgentDropTarget(agent: Agent): void {
  if (dropTargetAgentId.value === agent.id) {
    dropTargetAgentId.value = null;
  }
}

function dropWorkItem(event: DragEvent, agent: Agent): void {
  const item = draggedWorkItem.value;
  if (!item || !agentCanReceivePrompt(agent)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  emit('assign-work-item', {
    agentId: agent.id,
    item,
  });
  clearDraggedWorkItem();
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
  padding: 0 var(--space-16) 0 var(--space-20);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

.cockpit-view__title-block {
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-8);
}

.cockpit-view h1 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-16);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-22);
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
  --cockpit-tile-width: 360px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--cockpit-tile-width)), var(--cockpit-tile-width)));
  gap: var(--space-12);
}

.cockpit-view__agent-card {
  width: min(100%, var(--cockpit-tile-width));
  min-height: 172px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-low) 70%, transparent);
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: var(--space-8);
  padding: var(--space-10);
  text-align: left;
  cursor: pointer;
}

.cockpit-view__agent-card:hover,
.cockpit-view__agent-card:focus-visible {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-low));
}

.cockpit-view__agent-card--drop-ready {
  border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
}

.cockpit-view__agent-card--drop-target {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface-low));
  box-shadow: inset 0 0 0 1px var(--color-primary);
}

.cockpit-view__agent-card:focus-visible,
.cockpit-view__prompt button:focus-visible,
.cockpit-view__team-title:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.cockpit-view__agent-header {
  min-width: 0;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-8);
  padding-bottom: var(--space-8);
  border-bottom: 1px solid var(--color-border);
}

.cockpit-view__agent-title {
  min-width: 0;
  display: grid;
  gap: 1px;
}

.cockpit-view__agent-title strong,
.cockpit-view__agent-title span,
.cockpit-view__agent-body strong,
.cockpit-view__agent-body span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cockpit-view__agent-title strong {
  color: var(--color-text);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.cockpit-view__agent-title span,
.cockpit-view__agent-body span {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.cockpit-view__agent-state {
  color: var(--color-success);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-18);
}

.cockpit-view__agent-state[data-status='working'],
.cockpit-view__agent-state[data-status='starting'],
.cockpit-view__agent-state[data-status='awaitingInput'] {
  color: var(--color-warning);
}

.cockpit-view__agent-state[data-status='error'] {
  color: var(--color-error);
}

.cockpit-view__agent-body {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: var(--space-3);
}

.cockpit-view__agent-body strong {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-20);
}

.cockpit-view__prompt {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  gap: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface-lowest);
}

.cockpit-view__prompt input {
  min-width: 0;
  height: 34px;
  border: 0;
  padding: 0 0 0 var(--space-8);
  color: var(--color-text);
  background: transparent;
  outline: none;
}

.cockpit-view__prompt input::placeholder {
  color: var(--color-text-muted);
}

.cockpit-view__prompt input:disabled {
  opacity: 0.6;
}

.cockpit-view__prompt button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-primary);
  background: transparent;
  cursor: pointer;
}

.cockpit-view__prompt button:disabled {
  color: var(--color-text-muted);
  cursor: default;
  opacity: 0.45;
}

.cockpit-view__prompt svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
}

.cockpit-view__add-card {
  width: min(100%, var(--cockpit-tile-width));
  min-height: 172px;
  display: grid;
  place-items: center;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-low) 48%, transparent);
}

.cockpit-view__add-card:hover,
.cockpit-view__add-card:focus-within {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-surface-low) 80%, transparent);
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
