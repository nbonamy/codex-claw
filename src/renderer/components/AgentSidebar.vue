<template>
  <aside
    class="agent-sidebar"
    :style="sidebarStyle"
    aria-label="Agents"
  >
    <header class="agent-sidebar__header">
      <strong>{{ teamTitle }}</strong>
      <button
        class="agent-sidebar__collapse"
        type="button"
        aria-label="Hide agent sidebar"
        @click="emit('collapse-sidebar')"
      >
        <PanelLeftCloseIcon class="agent-sidebar__collapse-icon" />
      </button>
    </header>

    <nav class="agent-sidebar__list">
      <button
        v-for="agent in agents"
        :key="agent.id"
        class="agent-sidebar__agent"
        :class="{ 'agent-sidebar__agent--active': agent.id === activeAgentId }"
        type="button"
        :aria-pressed="agent.id === activeAgentId"
        @click="selectAgent(agent.id)"
        @contextmenu.prevent="openAgentMenu(agent.id, $event)"
      >
        <AgentAvatar
          class="agent-sidebar__avatar"
          :avatar="agent.avatar"
          :name="agent.name"
          size="md"
        />
        <span class="agent-sidebar__meta">
          <strong>{{ agent.name }}</strong>
          <span class="agent-sidebar__status-text">{{ agentStatusText(agent) }}</span>
          <span class="agent-sidebar__folder">{{ folderBasename(agent.folder) }}</span>
        </span>
        <span
          class="agent-sidebar__status"
          :data-status="agent.status.type"
          :aria-label="agentStatusLabel(agent.status.type)"
        />
      </button>
    </nav>

    <AgentContextMenu
      v-if="contextMenuAgentId"
      :move-targets="contextMenuMoveTargets"
      :x="contextMenuPosition.x"
      :y="contextMenuPosition.y"
      @action="emitContextAgentAction"
      @move-agent-to-team="emitContextAgentMove"
      @close="closeContextMenu"
    />

    <footer class="agent-sidebar__footer">
      <NewAgentButton
        :bench="bench"
        @deploy-bench-template="emit('deploy-bench-template', $event)"
        @new-agent="emit('new-agent')"
        @remove-bench-template="emit('remove-bench-template', $event)"
      />
    </footer>

    <div
      class="agent-sidebar__resize-handle"
      role="separator"
      aria-label="Resize agent sidebar"
      aria-orientation="vertical"
      :aria-valuemin="minWidth"
      :aria-valuemax="maxWidth"
      :aria-valuenow="currentWidth"
      tabindex="0"
      @pointerdown="onResizePointerDown"
      @pointermove="onResizePointerMove"
      @pointerup="onResizePointerEnd"
      @pointercancel="onResizePointerEnd"
      @keydown.left.prevent="emitResizedWidth(currentWidth - resizeStep)"
      @keydown.right.prevent="emitResizedWidth(currentWidth + resizeStep)"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Agent, AgentStatus, BenchTemplate, Team } from '../../shared/contracts';
import {
  PanelLeftCloseIcon,
} from '../shared/icons/app-icons';
import AgentContextMenu from './AgentContextMenu.vue';
import type { AgentContextMenuAction } from './AgentContextMenu.vue';
import AgentAvatar from './AgentAvatar.vue';
import NewAgentButton from './NewAgentButton.vue';

const props = defineProps<{
  agents: Agent[];
  activeAgentId: string | null;
  bench?: BenchTemplate[];
  teams?: Team[];
  teamName: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
}>();

const emit = defineEmits<{
  'collapse-sidebar': [];
  'close-agent': [agentId: string];
  'deploy-bench-template': [templateId: string];
  'duplicate-agent': [agentId: string];
  'edit-agent': [agentId: string];
  'move-agent-to-team': [payload: { agentId: string; teamId: string }];
  'new-agent': [];
  'resize-sidebar': [width: number];
  'restart-agent': [agentId: string];
  'save-agent-to-bench': [agentId: string];
  'select-agent': [agentId: string];
  'remove-bench-template': [templateId: string];
}>();

const minWidth = computed(() => props.minWidth ?? 72);
const maxWidth = computed(() => props.maxWidth ?? 420);
const resizeStep = 16;
const currentWidth = computed(() => clampWidth(props.width ?? 260));
const teamTitle = computed(() => props.teamName.toUpperCase());
const bench = computed(() => props.bench ?? []);
const contextMenuAgentId = ref<string | null>(null);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuAgent = computed(() => (
  contextMenuAgentId.value ? props.agents.find((agent) => agent.id === contextMenuAgentId.value) ?? null : null
));
const contextMenuMoveTargets = computed(() => {
  const agent = contextMenuAgent.value;
  if (!agent) {
    return [];
  }

  return (props.teams ?? []).filter((team) => team.id !== agent.teamId);
});
const sidebarStyle = computed<Record<string, string>>(() => ({
  '--agent-sidebar-width': `${currentWidth.value}px`,
  '--agent-sidebar-min-width': `${minWidth.value}px`,
  '--agent-sidebar-max-width': `${maxWidth.value}px`,
}));
let resizeStart: { pointerId: number; clientX: number; width: number } | null = null;

function agentStatusLabel(status: AgentStatus['type']): string {
  switch (status) {
    case 'working':
      return 'Working';
    case 'starting':
      return 'Starting';
    case 'awaitingInput':
      return 'Awaiting input';
    case 'error':
      return 'Error';
    case 'idle':
      return 'Idle';
  }
}

function agentStatusText(agent: Agent): string {
  if (agent.statusText) {
    return agent.statusText;
  }

  switch (agent.status.type) {
    case 'working':
      return agent.status.detail ?? agentStatusLabel(agent.status.type);
    case 'awaitingInput':
      return agent.status.detail ?? agentStatusLabel(agent.status.type);
    case 'error':
      return agent.status.message ?? agentStatusLabel(agent.status.type);
    case 'starting':
    case 'idle':
      return agentStatusLabel(agent.status.type);
  }
}

function folderBasename(folder: string): string {
  return folder.trim().split(/[\\/]/).filter(Boolean).at(-1) ?? folder;
}

function clampWidth(width: number): number {
  return Math.min(Math.max(Math.round(width), minWidth.value), maxWidth.value);
}

function emitResizedWidth(width: number): void {
  emit('resize-sidebar', clampWidth(width));
}

function selectAgent(agentId: string): void {
  emit('select-agent', agentId);
}

function openAgentMenu(agentId: string, event: MouseEvent): void {
  contextMenuAgentId.value = agentId;
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY,
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
  closeContextMenu();
}

function emitContextAgentMove(teamId: string): void {
  const agentId = contextMenuAgentId.value;
  if (!agentId) {
    return;
  }

  emit('move-agent-to-team', { agentId, teamId });
  closeContextMenu();
}

function closeContextMenu(): void {
  contextMenuAgentId.value = null;
}

function resizeHandle(event: PointerEvent): HTMLElement | null {
  return event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
}

function onResizePointerDown(event: PointerEvent): void {
  event.preventDefault();
  resizeStart = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    width: currentWidth.value,
  };
  resizeHandle(event)?.setPointerCapture?.(event.pointerId);
}

function onResizePointerMove(event: PointerEvent): void {
  if (!resizeStart || event.pointerId !== resizeStart.pointerId) {
    return;
  }

  emitResizedWidth(resizeStart.width + event.clientX - resizeStart.clientX);
}

function onResizePointerEnd(event: PointerEvent): void {
  if (!resizeStart || event.pointerId !== resizeStart.pointerId) {
    return;
  }

  resizeHandle(event)?.releasePointerCapture?.(event.pointerId);
  resizeStart = null;
}
</script>

<style scoped>
.agent-sidebar {
  --agent-sidebar-width: 260px;
  --agent-sidebar-min-width: 72px;
  --agent-sidebar-max-width: 420px;
  --agent-sidebar-avatar-size: 36px;
  --agent-sidebar-row-min-height: 64px;
  --agent-sidebar-status-column-width: 12px;
  --agent-status-dot-size: 10px;
  position: relative;
  container-type: inline-size;
  flex: 0 0 clamp(var(--agent-sidebar-min-width), var(--agent-sidebar-width), var(--agent-sidebar-max-width));
  width: clamp(var(--agent-sidebar-min-width), var(--agent-sidebar-width), var(--agent-sidebar-max-width));
  min-width: var(--agent-sidebar-min-width);
  max-width: var(--agent-sidebar-max-width);
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-shell-sidebar);
  border-right: 1px solid var(--color-border);
  user-select: none;
}

.agent-sidebar__header {
  height: var(--workbench-appbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  min-width: 0;
  padding-left: var(--space-16);
  padding-right: var(--space-2);
  color: var(--color-text);
  -webkit-app-region: drag;
}

.agent-sidebar__header strong {
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-sidebar__collapse {
  display: flex;
  align-items: center;
  margin-left: auto;
  padding: 0;
  border: none;
  background: transparent;
  -webkit-app-region: no-drag;
}

.agent-sidebar__collapse:hover {
  background: var(--color-surface-base);
}

.agent-sidebar__collapse:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.agent-sidebar__collapse-icon {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.agent-sidebar__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: var(--space-6);
}

.agent-sidebar__agent {
  width: 100%;
  min-height: var(--agent-sidebar-row-min-height);
  display: grid;
  grid-template-columns: var(--agent-sidebar-avatar-size) minmax(0, 1fr) var(--agent-sidebar-status-column-width);
  align-items: center;
  gap: var(--space-8);
  margin-bottom: var(--space-1);
  padding: var(--space-4) var(--space-6);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.agent-sidebar__agent--active {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  border-color: var(--color-primary);
}

.agent-sidebar__avatar {
  --agent-avatar-size: var(--agent-sidebar-avatar-size);
  --agent-avatar-font-size: var(--font-size-13);
}

.agent-sidebar__meta {
  min-width: 0;
  display: grid;
  gap: 1.5px;
}

.agent-sidebar__meta strong,
.agent-sidebar__meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-sidebar__meta strong {
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-18);
}

.agent-sidebar__status-text {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-16);
}

.agent-sidebar__folder {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-16);
}

.agent-sidebar__status {
  width: var(--agent-status-dot-size);
  height: var(--agent-status-dot-size);
  border-radius: var(--radius-full);
  background: var(--color-success);
}

.agent-sidebar__status[data-status='working'],
.agent-sidebar__status[data-status='starting'] {
  background: var(--color-warning);
}

.agent-sidebar__status[data-status='awaitingInput'] {
  background: var(--color-warning);
}

.agent-sidebar__status[data-status='error'] {
  background: var(--color-error);
}

.agent-sidebar__footer {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-6);
}

.agent-sidebar__resize-handle {
  position: absolute;
  z-index: 2;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  outline: none;
  -webkit-app-region: no-drag;
}

.agent-sidebar__resize-handle::after {
  content: "";
  position: absolute;
  top: 0;
  right: 3px;
  width: 1px;
  height: 100%;
  background: transparent;
}

.agent-sidebar__resize-handle:hover::after,
.agent-sidebar__resize-handle:focus-visible::after {
  background: var(--color-primary);
}

@container (max-width: 140px) {
  .agent-sidebar__header {
    justify-content: center;
    padding: 0;
  }

  .agent-sidebar__header strong {
    display: none;
  }

  .agent-sidebar__collapse {
    width: var(--space-16);
    height: var(--space-16);
  }

  .agent-sidebar__list {
    display: grid;
    align-content: start;
    align-items: start;
    justify-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-2);
  }

  .agent-sidebar__agent {
    position: relative;
    width: var(--space-20);
    min-height: var(--space-20);
    grid-template-columns: var(--agent-sidebar-avatar-size);
    place-items: center;
    gap: 0;
    margin-bottom: 0;
    padding: var(--space-2);
    border-radius: var(--radius-full);
  }

  .agent-sidebar__meta {
    display: none;
  }

  .agent-sidebar__status {
    position: absolute;
    right: var(--space-2);
    bottom: var(--space-2);
    border: 2px solid var(--color-surface-low);
  }

  .agent-sidebar__footer {
    justify-items: center;
    padding: var(--space-4) var(--space-2);
  }

}
</style>
