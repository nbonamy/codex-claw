<template>
  <aside
    class="agent-sidebar"
    :class="{ 'agent-sidebar--compact': compact }"
    :style="sidebarStyle"
    aria-label="Agents"
  >
    <header class="agent-sidebar__header">
      <strong :title="teamName">Sessions</strong>
      <button
        class="agent-sidebar__collapse"
        type="button"
        aria-label="Hide agent sidebar"
        @click="emit('collapse-sidebar')"
      >
        <PanelLeftCloseIcon class="agent-sidebar__collapse-icon" />
      </button>
    </header>

    <div class="agent-sidebar__start-work">
      <StartWorkMenu @select="emit('start-work', $event)" />
    </div>

    <nav class="agent-sidebar__list" aria-label="Workspace sessions">
      <section
        v-for="group in workspaceGroups"
        :key="group.id"
        class="agent-sidebar__workspace-group"
        :data-group-kind="group.kind"
      >
        <header class="agent-sidebar__workspace-header">
          <MessageCircleIcon
            v-if="group.kind === 'quickChats'"
            class="agent-sidebar__workspace-icon"
            aria-hidden="true"
          />
          <RepositoryIconPicker
            v-else
            :label="group.label"
            :expanded="!isWorkspaceCollapsed(group)"
            :model-value="repositoryIcon(group.repositoryKey, group.repositoryRoot)"
            @update:model-value="updateRepositoryIcon(group.repositoryKey, group.repositoryRoot, $event)"
          />
          <button
            class="agent-sidebar__workspace-label"
            type="button"
            :aria-label="`${isWorkspaceCollapsed(group) ? 'Expand' : 'Collapse'} ${group.label} sessions`"
            :aria-expanded="!isWorkspaceCollapsed(group)"
            @click="toggleWorkspace(group)"
          >
            <strong>{{ group.label }}</strong>
          </button>
          <span v-if="group.kind === 'repository'" class="agent-sidebar__workspace-actions">
            <button
              type="button"
              aria-label="Create agent from branch, pull request, or issue"
              title="Create from…"
              @click.stop="emit('create-agent-from-repository', { agentId: group.sessions[0]!.agentId, repositoryName: group.label, repositoryRoot: group.repositoryRoot! })"
            >
              <GitForkIcon aria-hidden="true" />
            </button>
            <el-popover
              :visible="repositorySessionMenuId === group.id"
              placement="bottom-end"
              trigger="click"
              :width="220"
              popper-class="claw-popover agent-sidebar__repository-session-menu-popover"
              @update:visible="setRepositorySessionMenuVisible(group, $event)"
            >
              <template #reference>
                <button
                  type="button"
                  :aria-label="`New session in ${group.label}`"
                  title="New session"
                  @click.stop
                >
                  <PlusIcon aria-hidden="true" />
                </button>
              </template>
              <p v-if="repositorySessionMenu.loading.value[group.id]" class="agent-sidebar__repository-session-menu-state">Loading default branch…</p>
              <p v-else-if="repositorySessionMenu.errors.value[group.id]" class="agent-sidebar__repository-session-menu-state agent-sidebar__repository-session-menu-state--error">{{ repositorySessionMenu.errors.value[group.id] }}</p>
              <AppMenu
                v-else
                class="app-menu--embedded"
                :ariaLabel="`New session in ${group.label}`"
                :items="repositorySessionMenuItems(group)"
                @select="selectRepositorySessionMenuItem(group, $event)"
              />
            </el-popover>
          </span>
        </header>

        <button
          v-for="session in group.sessions"
          v-show="!isWorkspaceCollapsed(group)"
          :key="session.agentId"
          class="agent-sidebar__agent"
          :class="[
            { 'agent-sidebar__agent--active': session.isActive },
            agentReorder.dropTargetClass(session.agentId),
          ]"
          type="button"
          v-bind="agentReorder.dragItemAttributes(session.agentId)"
          :data-session-kind="session.kind"
          :aria-pressed="session.isActive"
          @click="selectAgent(session.agentId)"
          @contextmenu.prevent="openAgentMenu(session.agentId, $event)"
          @dragstart="agentReorder.onDragStart(session.agentId, $event)"
          @dragover="agentReorder.onDragOver(session.agentId, $event)"
          @dragleave="agentReorder.onDragLeave(session.agentId, $event)"
          @drop="agentReorder.onDrop(session.agentId, $event)"
          @dragend="agentReorder.onDragEnd"
        >
          <GitForkIcon
            v-if="session.kind === 'worktree'"
            class="agent-sidebar__session-icon"
            aria-hidden="true"
          />
          <GitBranchIcon v-else class="agent-sidebar__session-icon" aria-hidden="true" />
          <span class="agent-sidebar__meta">
            <strong>{{ session.displayTitle }}</strong>
          </span>
          <span
            v-if="!session.isUnread && quickSwitchShortcutsVisible && session.quickSwitchIndex < 9"
            class="agent-sidebar__quick-switch-shortcut"
            :aria-label="`Switch to ${session.displayTitle} with Command ${session.quickSwitchIndex + 1}`"
          ><span aria-hidden="true">⌘</span>{{ session.quickSwitchIndex + 1 }}</span>
          <span
            v-else
            class="agent-sidebar__status"
            :class="{ 'agent-sidebar__status--unread': session.isUnread }"
            :data-status="session.status.type"
            :aria-label="session.isUnread ? 'Unread activity' : agentStatusLabel(session.status.type)"
          />
        </button>
      </section>
    </nav>

    <AgentContextMenu
      v-if="contextMenuAgentId"
      :fork-disabled="!canForkContextMenuAgent"
      :open-in-catalog="resolvedOpenInCatalog"
      :open-in-disabled="!contextMenuAgentIsLocal"
      :move-targets="contextMenuMoveTargets"
      :x="contextMenuPosition.x"
      :y="contextMenuPosition.y"
      @action="emitContextAgentAction"
      @move-agent-to-team="emitContextAgentMove"
      @open-in="emitContextAgentOpenIn"
      @close="closeContextMenu"
    />

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
import type { Agent, OpenInApplication, OpenInApplicationCatalog, ReorderAgentsInput, SourceBranch, Team } from '@codex-claw/core/contracts';
import { projectWorkspaceSidebar, type WorkspaceSidebarGroup } from '@codex-claw/core/workspace-sidebar';
import {
  GitBranchIcon,
  GitForkIcon,
  MessageCircleIcon,
  PanelLeftCloseIcon,
  PlusIcon,
} from '../shared/icons/app-icons';
import AgentContextMenu from './AgentContextMenu.vue';
import type { AgentContextMenuAction } from './AgentContextMenu.vue';
import RepositoryIconPicker from './RepositoryIconPicker.vue';
import StartWorkMenu from './StartWorkMenu.vue';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import { agentStatusLabel } from '../shared/agent-display';
import { useListReorderDrag } from '../shared/use-list-reorder-drag';
import { useRepositorySessionMenu } from './use-repository-session-menu';

const props = defineProps<{
  agents: Agent[];
  activeAgentId: string | null;
  unreadAgentIds?: string[];
  forkableAgentIds?: string[];
  compact?: boolean;
  collapsedRepositoryKeys?: string[];
  teams?: Team[];
  teamId?: string | null;
  teamName: string;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  quickSwitchShortcutsVisible?: boolean;
  repositoryIcons?: Record<string, string>;
  listRepositoryBranches?: (input: { agentId: string; repositoryRoot: string }) => Promise<SourceBranch[]>;
  openInCatalog?: OpenInApplicationCatalog;
}>();

const emit = defineEmits<{
  'collapse-sidebar': [];
  'close-agent': [agentId: string];
  'update-collapsed-repositories': [repositoryKeys: string[]];
  'create-agent-from-repository': [payload: { agentId: string; repositoryName: string; repositoryRoot: string }];
  'create-agent-on-branch': [payload: { agentId: string; repositoryName: string; repositoryRoot: string; branch: SourceBranch }];
  'create-agent-worktree-in-repository': [payload: { agentId: string; repositoryName: string; repositoryRoot: string }];
  'duplicate-agent': [agentId: string];
  'fork-agent': [agentId: string];
  'edit-agent': [agentId: string];
  'move-agent-to-team': [payload: { agentId: string; teamId: string }];
  'open-in': [payload: { agentId: string; application: OpenInApplication }];
  'reorder-agents': [payload: ReorderAgentsInput];
  'resize-sidebar': [width: number];
  'resume-session': [agentId: string];
  'restart-agent': [agentId: string];
  'save-agent-to-bench': [agentId: string];
  'select-agent': [agentId: string];
  'start-work': [action: 'github' | 'local' | 'url'];
  'update-repository-icon': [payload: { repositoryKey: string; repositoryRoot: string; icon: string | undefined }];
}>();

const minWidth = computed(() => props.minWidth ?? 72);
const maxWidth = computed(() => props.maxWidth ?? 420);
const resizeStep = 16;
const currentWidth = computed(() => clampWidth(props.width ?? 260));
const resolvedOpenInCatalog = computed<OpenInApplicationCatalog>(() => props.openInCatalog ?? ({
  defaultApplication: 'finder',
  applications: [],
}));
const workspaceGroups = computed(() => projectWorkspaceSidebar({
  agents: props.agents,
  activeAgentId: props.activeAgentId,
  unreadAgentIds: props.unreadAgentIds,
}));
const contextMenuAgentId = ref<string | null>(null);
const repositorySessionMenu = useRepositorySessionMenu(() => props.listRepositoryBranches);
const repositorySessionMenuId = repositorySessionMenu.visibleGroupId;
const collapsedRepositoryKeys = computed(() => new Set(props.collapsedRepositoryKeys ?? []));
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuAgent = computed(() => (
  contextMenuAgentId.value ? props.agents.find((agent) => agent.id === contextMenuAgentId.value) ?? null : null
));
const canForkContextMenuAgent = computed(() => (
  contextMenuAgent.value?.status.type === 'idle' &&
  Boolean(contextMenuAgent.value.backendSession) &&
  (props.forkableAgentIds ?? []).includes(contextMenuAgent.value.id)
));
const contextMenuAgentIsLocal = computed(() => {
  const agent = contextMenuAgent.value;
  if (!agent) return false;
  const team = (props.teams ?? []).find((candidate) => candidate.id === agent.teamId);
  return !team?.remoteConnectionId;
});
const contextMenuMoveTargets = computed(() => {
  const agent = contextMenuAgent.value;
  if (!agent) {
    return [];
  }
  const sourceTeam = (props.teams ?? []).find((team) => team.id === agent.teamId) ?? null;
  if (sourceTeam?.remoteConnectionId) {
    return [];
  }

  return (props.teams ?? []).filter((team) => team.id !== agent.teamId && !team.remoteConnectionId);
});
const agentReorder = useListReorderDrag<string>({
  itemIds: () => props.agents.map((agent) => agent.id),
  onDrop: ({ draggedId, beforeId }) => {
    if (!props.teamId) {
      return;
    }

    emit('reorder-agents', {
      teamId: props.teamId,
      agentId: draggedId,
      beforeAgentId: beforeId,
    });
  },
});
const sidebarStyle = computed<Record<string, string>>(() => ({
  '--agent-sidebar-width': `${currentWidth.value}px`,
  '--agent-sidebar-min-width': `${minWidth.value}px`,
  '--agent-sidebar-max-width': `${maxWidth.value}px`,
}));
let resizeStart: { pointerId: number; clientX: number; width: number } | null = null;

function clampWidth(width: number): number {
  return Math.min(Math.max(Math.round(width), minWidth.value), maxWidth.value);
}

function emitResizedWidth(width: number): void {
  emit('resize-sidebar', clampWidth(width));
}

function selectAgent(agentId: string): void {
  emit('select-agent', agentId);
}

function workspaceCollapseKey(group: WorkspaceSidebarGroup): string {
  return group.repositoryKey ?? group.id;
}

function isWorkspaceCollapsed(group: WorkspaceSidebarGroup): boolean {
  return collapsedRepositoryKeys.value.has(workspaceCollapseKey(group));
}

function toggleWorkspace(group: WorkspaceSidebarGroup): void {
  const key = workspaceCollapseKey(group);
  const next = new Set(collapsedRepositoryKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  emit('update-collapsed-repositories', [...next]);
}

function repositoryIcon(repositoryKey: string | undefined, repositoryRoot: string | undefined): string | undefined {
  if (!repositoryRoot) return undefined;
  return props.repositoryIcons?.[repositoryKey ?? repositoryRoot] ?? props.repositoryIcons?.[repositoryRoot];
}

function updateRepositoryIcon(repositoryKey: string | undefined, repositoryRoot: string | undefined, icon: string | undefined): void {
  if (!repositoryRoot) return;
  emit('update-repository-icon', { repositoryKey: repositoryKey ?? repositoryRoot, repositoryRoot, icon });
}

async function setRepositorySessionMenuVisible(
  group: WorkspaceSidebarGroup,
  visible: boolean,
): Promise<void> {
  await repositorySessionMenu.setVisible(group, visible);
}

function repositorySessionMenuItems(
  group: WorkspaceSidebarGroup,
): AppMenuItem[] {
  const defaultBranch = repositorySessionMenu.defaultBranches.value[group.id];
  return [
    {
      id: 'default-branch',
      type: 'action',
      label: defaultBranch?.name ?? 'Default branch unavailable',
      icon: GitBranchIcon,
      disabled: !defaultBranch,
    },
    { id: 'new-worktree', type: 'action', label: 'New worktree…', icon: GitForkIcon },
  ];
}

function selectRepositorySessionMenuItem(
  group: WorkspaceSidebarGroup,
  itemId: string,
): void {
  if (group.kind !== 'repository' || !group.repositoryRoot) return;
  const payload = {
    agentId: group.sessions[0]!.agentId,
    repositoryName: group.label,
    repositoryRoot: group.repositoryRoot!,
  };
  if (itemId === 'default-branch') {
    const branch = repositorySessionMenu.defaultBranches.value[group.id];
    if (branch) {
      emit('create-agent-on-branch', { ...payload, branch });
    }
  } else if (itemId === 'new-worktree') {
    emit('create-agent-worktree-in-repository', payload);
  }
  repositorySessionMenuId.value = null;
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
    case 'fork-agent':
      emit('fork-agent', agentId);
      break;
    case 'edit-agent':
      emit('edit-agent', agentId);
      break;
    case 'resume-session':
      emit('resume-session', agentId);
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

function emitContextAgentOpenIn(application: OpenInApplication): void {
  const agentId = contextMenuAgentId.value;
  if (!agentId) return;
  emit('open-in', { agentId, application });
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
  --agent-sidebar-row-min-height: 30px;
  --agent-sidebar-workspace-icon-size: 16px;
  --agent-sidebar-repository-icon-size: 20px;
  --agent-sidebar-repository-icon-column-width: 24px;
  --agent-sidebar-workspace-column-gap: 4px;
  --agent-sidebar-workspace-inline-padding: 4px;
  --agent-sidebar-status-column-width: 12px;
  --agent-status-dot-size: 8px;
  position: relative;
  container-type: inline-size;
  flex: 0 0
    clamp(
      var(--agent-sidebar-min-width),
      var(--agent-sidebar-width),
      var(--agent-sidebar-max-width)
    );
  width: clamp(
    var(--agent-sidebar-min-width),
    var(--agent-sidebar-width),
    var(--agent-sidebar-max-width)
  );
  min-width: var(--agent-sidebar-min-width);
  max-width: var(--agent-sidebar-max-width);
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--color-shell-sidebar);
  user-select: none;
}

.agent-sidebar__header {
  height: var(--workbench-appbar-height);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-6);
  min-width: 0;
  padding-left: var(--space-16);
  padding-right: var(--space-8);
  color: var(--color-text);
  background: transparent;
  border-bottom: 1px solid var(--color-shell-appbar-divider);
  -webkit-app-region: drag;
}

.agent-sidebar__header-action {
  width: var(--space-12);
  height: var(--space-12);
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.agent-sidebar__header-action:hover {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.agent-sidebar__header-action svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.agent-sidebar__header strong {
  margin-right: auto;
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-sidebar__collapse {
  width: var(--space-12);
  height: var(--space-12);
  display: grid;
  place-items: center;
  margin-left: 0;
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
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  padding: var(--space-3) var(--space-4);
}

.agent-sidebar__start-work {
  flex: 0 0 auto;
  padding: var(--space-6) var(--space-8) var(--space-4);
}

.agent-sidebar__workspace-group + .agent-sidebar__workspace-group {
  margin-top: var(--space-2);
}

.agent-sidebar__workspace-header {
  box-sizing: border-box;
  min-width: 0;
  display: grid;
  grid-template-columns:
    var(--agent-sidebar-repository-icon-column-width)
    minmax(0, 1fr)
    auto;
  align-items: center;
  gap: var(--agent-sidebar-workspace-column-gap);
  min-height: 30px;
  padding: 2px var(--agent-sidebar-workspace-inline-padding);
  color: var(--color-text);
}

.agent-sidebar__workspace-label,
.agent-sidebar__workspace-actions button {
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.agent-sidebar__workspace-label {
  min-width: 0;
  min-height: var(--agent-sidebar-row-min-height);
  justify-content: start;
  border-radius: var(--radius-sm);
  text-align: left;
}

.agent-sidebar__workspace-label:hover,
.agent-sidebar__workspace-label:focus-visible {
  color: var(--color-text);
}

.agent-sidebar__workspace-label:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.agent-sidebar__workspace-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 100ms ease;
}

.agent-sidebar__workspace-header:hover .agent-sidebar__workspace-actions {
  opacity: 1;
}

.agent-sidebar__workspace-actions button {
  width: var(--space-12);
  height: var(--space-12);
  border-radius: var(--radius-sm);
}

.agent-sidebar__workspace-actions svg {
  width: calc(var(--icon-sm) + 2px);
  height: calc(var(--icon-sm) + 2px);
}

.agent-sidebar__workspace-actions button:hover {
  color: var(--color-text);
  background: var(--color-surface-base);
}

.agent-sidebar__repository-session-menu-state {
  margin: 0;
  padding: var(--space-4) var(--space-6);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.agent-sidebar__repository-session-menu-state--error {
  color: var(--color-error);
}

.agent-sidebar__workspace-icon {
  width: var(--agent-sidebar-repository-icon-size);
  height: var(--agent-sidebar-repository-icon-size);
  color: var(--color-text-muted);
  stroke-width: 1.8;
  justify-self: center;
}

.agent-sidebar__workspace-label strong {
  min-width: 0;
  overflow: hidden;
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-18);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-sidebar__agent {
  position: relative;
  width: 100%;
  min-height: var(--agent-sidebar-row-min-height);
  display: grid;
  grid-template-columns:
    var(--agent-sidebar-repository-icon-column-width) minmax(0, 1fr)
    var(--agent-sidebar-status-column-width);
  align-items: center;
  gap: var(--agent-sidebar-workspace-column-gap);
  margin: 0;
  padding: 1px var(--space-6) 1px
    calc(var(--agent-sidebar-workspace-inline-padding) + var(--space-6));
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.agent-sidebar__agent::before,
.agent-sidebar__agent::after {
  content: "";
  position: absolute;
  left: var(--space-6);
  right: var(--space-6);
  height: 3px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-shell-sidebar);
  opacity: 0;
  transform: scaleX(0.92);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
  pointer-events: none;
}

.agent-sidebar__agent::before {
  top: -2px;
}

.agent-sidebar__agent::after {
  bottom: -2px;
}

.agent-sidebar__agent.list-reorder-drag--drop-before::before,
.agent-sidebar__agent.list-reorder-drag--drop-after::after {
  opacity: 1;
  transform: scaleX(1);
}

.agent-sidebar__agent.list-reorder-drag--dragging {
  opacity: 0.48;
}

.agent-sidebar__agent--active {
  background: var(--color-surface-base);
}

.agent-sidebar__session-icon {
  width: var(--agent-sidebar-workspace-icon-size);
  height: var(--agent-sidebar-workspace-icon-size);
  stroke-width: 1.8;
  justify-self: center;
}

.agent-sidebar__agent[data-session-kind="main"] .agent-sidebar__session-icon {
  color: var(--color-primary);
}

.agent-sidebar__agent[data-session-kind="branch"] .agent-sidebar__session-icon {
  color: var(--color-success);
}

.agent-sidebar__agent[data-session-kind="worktree"]
  .agent-sidebar__session-icon {
  color: var(--color-warning);
}

.agent-sidebar__agent[data-session-kind="detached"]
  .agent-sidebar__session-icon,
.agent-sidebar__agent[data-session-kind="folder"] .agent-sidebar__session-icon {
  color: var(--color-text-muted);
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
  font-weight: var(--font-weight-regular);
  line-height: var(--line-height-18);
}

.agent-sidebar__status {
  width: var(--agent-status-dot-size);
  height: var(--agent-status-dot-size);
  border-radius: var(--radius-full);
  background: var(--color-success);
}

.agent-sidebar__status[data-status="working"],
.agent-sidebar__status[data-status="starting"] {
  background: var(--color-warning);
}

.agent-sidebar__status[data-status="awaitingInput"] {
  background: var(--color-warning);
}

.agent-sidebar__status[data-status="error"] {
  background: var(--color-error);
}

.agent-sidebar__status.agent-sidebar__status--unread {
  background: var(--color-error);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-error) 20%, transparent);
}

.agent-sidebar__quick-switch-shortcut {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 28px;
  height: var(--line-height-18);
  margin-left: -16px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: var(--color-surface-base);
  font-size: var(--font-size-11);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-18);
  white-space: nowrap;
}

.agent-sidebar--compact {
  --agent-sidebar-row-min-height: 28px;
  --agent-sidebar-workspace-icon-size: 16px;
  --agent-sidebar-repository-icon-size: 20px;
  --agent-sidebar-status-column-width: var(--space-4);
  --agent-status-dot-size: var(--space-4);
}

.agent-sidebar--compact .agent-sidebar__agent {
  padding-top: 1px;
  padding-bottom: 1px;
}

.agent-sidebar--compact .agent-sidebar__meta {
  display: block;
}

.agent-sidebar--compact .agent-sidebar__meta strong {
  display: block;
  font-size: var(--font-size-14);
  line-height: var(--line-height-18);
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
  background: var(--color-resize-handle-hover);
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
  }

  .agent-sidebar__workspace-group {
    width: 100%;
  }

  .agent-sidebar__workspace-header {
    display: flex;
    justify-content: center;
    padding: var(--space-2);
  }

  .agent-sidebar__workspace-actions,
  .agent-sidebar__header-action {
    display: none;
  }

  .agent-sidebar__workspace-label {
    display: none;
  }

  .agent-sidebar__agent {
    position: relative;
    width: 100%;
    min-height: var(--space-20);
    grid-template-columns: var(--icon-sm);
    place-items: center;
    gap: 0;
    margin-bottom: 0;
    padding: var(--space-4) var(--space-2);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .agent-sidebar__meta {
    display: none;
  }

  .agent-sidebar__status {
    position: absolute;
    left: calc(50% + 10px);
    bottom: var(--space-4);
    border: 1px solid var(--color-surface-low);
  }

  .agent-sidebar__start-work {
    padding-inline: var(--space-4);
  }

  .agent-sidebar__start-work :deep(.start-work-menu__trigger) {
    justify-content: center;
    padding-inline: 0;
  }

  .agent-sidebar__start-work :deep(.start-work-menu__trigger span) {
    display: none;
  }

}
</style>
