<template>
  <aside
    ref="railRoot"
    class="team-rail"
    :class="{ 'team-rail--agent-sidebar-expanded': agentSidebarExpanded }"
    :aria-label="$t('surface.teamRail.teams')"
  >
    <div class="team-rail__header" />

    <div class="team-rail__body">
      <button
        class="team-rail__cockpit"
        :class="{ 'team-rail__cockpit--active': cockpitActive }"
        type="button"
        :aria-label="$t('surface.teamRail.cockpit')"
        :aria-pressed="cockpitActive"
        @click="emit('select-cockpit')"
      >
        <CockpitIcon :teams="teams" />
      </button>

      <button
        v-for="team in teams"
        :key="team.id"
        class="team-rail__team"
        :class="[
          { 'team-rail__team--active': isTeamActive(team.id) },
          { 'team-rail__team--unread': isTeamUnread(team.id) },
          teamReorder.dropTargetClass(team.id),
        ]"
        type="button"
        v-bind="teamReorder.dragItemAttributes(team.id)"
        :style="{ backgroundColor: team.color ?? defaultTeamColor }"
        :aria-label="isTeamUnread(team.id) ? $t('dynamic.teamUnread', { team: team.name }) : team.name"
        :aria-pressed="isTeamActive(team.id)"
        @click="emit('select-team', team.id)"
        @contextmenu.prevent="openTeamMenu(team.id, $event)"
        @dragstart="teamReorder.onDragStart(team.id, $event)"
        @dragover="teamReorder.onDragOver(team.id, $event)"
        @dragleave="teamReorder.onDragLeave(team.id, $event)"
        @drop="teamReorder.onDrop(team.id, $event)"
        @dragend="teamReorder.onDragEnd"
      >
        {{ team.avatar ?? teamInitials(team.name) }}
        <span
          v-if="isTeamUnread(team.id)"
          class="team-rail__unread-indicator"
          aria-hidden="true"
        />
      </button>

      <button
        class="team-rail__new"
        type="button"
        :aria-label="$t('surface.teamRail.createTeam')"
        @click="emit('new-team')"
      >
        <PlusIcon aria-hidden="true" />
      </button>

      <div class="team-rail__bottom">
        <button
          class="team-rail__automations"
          :class="{ 'team-rail__automations--active': automationsActive }"
          type="button"
          :aria-label="$t('surface.teamRail.automations')"
          :aria-pressed="automationsActive"
          @click="emit('select-automations')"
        >
          <AutomationIcon
            class="team-rail__automations-icon"
            aria-hidden="true"
          />
        </button>

        <SettingsMenu
          :active="settingsActive"
          :account="account"
          :rate-limits="rateLimits"
          @logout="emit('logout')"
          @open-settings="emit('open-settings')"
          @open-whats-new="emit('open-whats-new')"
          @quit="emit('quit')"
        />
      </div>
    </div>

    <TeamContextMenu
      v-if="contextMenuTeam"
      :team="contextMenuTeam"
      :can-close="canCloseContextTeam"
      :x="contextMenuPosition.x"
      :y="contextMenuPosition.y"
      @edit-team="selectEditTeam"
      @request-close-team="requestCloseTeam"
      @request-disconnect-team="requestDisconnectTeam"
      @close="contextMenuTeamId = null"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { AccountRateLimits, CodexAccount, ReorderTeamsInput, Team } from '@codex-claw/core/contracts';
import { defaultTeamColor } from '@codex-claw/core/team-colors';
import { teamInitials } from '@codex-claw/core/team-manager';
import { AutomationIcon, PlusIcon } from '../shared/icons/app-icons';
import { useListReorderDrag } from '../shared/use-list-reorder-drag';
import CockpitIcon from './CockpitIcon.vue';
import SettingsMenu from './SettingsMenu.vue';
import TeamContextMenu from './TeamContextMenu.vue';
import { confirmCloseTeam, confirmDisconnectTeam } from './team-close-confirmation';

const props = defineProps<{
  teams: Team[];
  activeTeamId: string | null;
  cockpitActive?: boolean;
  automationsActive?: boolean;
  rateLimits?: AccountRateLimits;
  account?: CodexAccount | null;
  settingsActive?: boolean;
  agentSidebarExpanded?: boolean;
  unreadTeamIds?: string[];
}>();

const emit = defineEmits<{
  'close-team': [teamId: string];
  'disconnect-team': [teamId: string];
  'edit-team': [teamId: string];
  'new-team': [];
  'open-settings': [];
  'open-whats-new': [];
  logout: [];
  quit: [];
  'reorder-teams': [input: ReorderTeamsInput];
  'select-cockpit': [];
  'select-automations': [];
  'select-team': [teamId: string];
}>();

const railRoot = ref<HTMLElement | null>(null);
const contextMenuTeamId = ref<string | null>(null);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuTeam = computed(() => (
  contextMenuTeamId.value ? props.teams.find((team) => team.id === contextMenuTeamId.value) ?? null : null
));
const canCloseContextTeam = computed(() => Boolean(contextMenuTeam.value) && props.teams.length > 1);
const unreadTeamIdSet = computed(() => new Set(props.unreadTeamIds ?? []));
const teamReorder = useListReorderDrag<string>({
  itemIds: () => props.teams.map((team) => team.id),
  onDrop: ({ draggedId, beforeId }) => {
    emit('reorder-teams', {
      teamId: draggedId,
      beforeTeamId: beforeId,
    });
  },
});
onMounted(() => {
  document.addEventListener('click', closeFloatingUiOnDocumentClick);
  document.addEventListener('keydown', closeFloatingUiOnEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeFloatingUiOnDocumentClick);
  document.removeEventListener('keydown', closeFloatingUiOnEscape);
});

function selectEditTeam(teamId: string): void {
  emit('edit-team', teamId);
  contextMenuTeamId.value = null;
}

function isTeamActive(teamId: string): boolean {
  return !props.cockpitActive && !props.automationsActive && !props.settingsActive && teamId === props.activeTeamId;
}

function isTeamUnread(teamId: string): boolean {
  return teamId !== props.activeTeamId && unreadTeamIdSet.value.has(teamId);
}

async function requestCloseTeam(teamId: string): Promise<void> {
  if (props.teams.length <= 1) {
    return;
  }

  const team = props.teams.find((candidate) => candidate.id === teamId);
  if (!team) {
    return;
  }

  contextMenuTeamId.value = null;
  await nextTick();

  if (await confirmCloseTeam(team)) {
    emit('close-team', team.id);
  }
}

async function requestDisconnectTeam(teamId: string): Promise<void> {
  if (props.teams.length <= 1) {
    return;
  }

  const team = props.teams.find((candidate) => candidate.id === teamId);
  if (!team?.remoteConnectionId) {
    return;
  }

  contextMenuTeamId.value = null;
  await nextTick();

  if (await confirmDisconnectTeam(team)) {
    emit('disconnect-team', team.id);
  }
}

function openTeamMenu(teamId: string, event: MouseEvent): void {
  contextMenuTeamId.value = teamId;
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY,
  };
}

function closeFloatingUiOnDocumentClick(event: MouseEvent): void {
  if (event.target instanceof Node && railRoot.value?.contains(event.target)) {
    return;
  }

  contextMenuTeamId.value = null;
}

function closeFloatingUiOnEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape') {
    return;
  }

  contextMenuTeamId.value = null;
}
</script>

<style scoped>
.team-rail {
  --team-rail-button-size: calc(var(--space-16) * var(--team-rail-scale));
  --team-text-color: white;
  --team-rail-icon-color: var(--color-text-muted);
  --team-rail-icon-hover-color: var(--color-text);
  --team-rail-icon-active-color: var(--color-primary);
  position: relative;
  flex: 0 0 var(--team-rail-width);
  width: var(--team-rail-width);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: transparent;
  user-select: none;
}

.team-rail--agent-sidebar-expanded::after {
  content: "";
  position: absolute;
  z-index: 1;
  top: var(--workbench-appbar-height);
  right: -1px;
  bottom: 0;
  width: 1px;
  background: var(--color-shell-rail-divider);
  pointer-events: none;
}

.team-rail__header {
  flex: 0 0 var(--workbench-appbar-height);
  width: 100%;
  background: var(--color-shell-collapsed-header);
  border-bottom: 1px solid var(--color-shell-appbar-divider);
}

.team-rail--agent-sidebar-expanded .team-rail__header {
  background: var(--color-shell-rail);
}

.team-rail__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-4);
  background: var(--color-shell-rail);
}

.team-rail__team {
  position: relative;
  width: var(--team-rail-button-size);
  height: var(--team-rail-button-size);
  border: 0;
  border-radius: var(--radius-lg);
  color: var(--team-text-color);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
  cursor: pointer;
}

.team-rail__team:not(.team-rail__team--active, .list-reorder-drag--dragging) {
  opacity: 0.6;
}

.team-rail__team--unread:not(
  .team-rail__team--active,
  .list-reorder-drag--dragging
) {
  opacity: 0.9;
}

.team-rail__team:not(
    .team-rail__team--active,
    .list-reorder-drag--dragging
  ):hover,
.team-rail__team:not(
    .team-rail__team--active,
    .list-reorder-drag--dragging
  ):focus-visible {
  opacity: 1;
}

.team-rail__cockpit,
.team-rail__automations {
  width: var(--team-rail-button-size);
  height: var(--team-rail-button-size);
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-full);
  color: var(--team-rail-icon-color);
  background: transparent;
  cursor: pointer;
}

.team-rail__cockpit:not(.team-rail__cockpit--active) {
  opacity: 0.6;
}

.team-rail__cockpit:hover,
.team-rail__cockpit:focus-visible,
.team-rail__automations:hover,
.team-rail__automations:focus-visible {
  color: var(--team-rail-icon-hover-color);
  outline: none;
}

.team-rail__cockpit--active,
.team-rail__automations--active {
  color: var(--team-rail-icon-active-color);
  opacity: 1;
}

.team-rail__cockpit:hover,
.team-rail__cockpit:focus-visible {
  opacity: 1;
}

.team-rail__automations svg,
.team-rail__new svg,
:deep() .settings-menu__trigger svg {
  width: var(--icon-xl);
  height: var(--icon-xl);
  stroke-width: 1.25px;
  transform: scale(1.15);
}

.team-rail__team::before,
.team-rail__team::after {
  content: "";
  position: absolute;
  left: 50%;
  width: calc(var(--team-rail-button-size) * 0.72);
  height: 3px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-shell-rail);
  transform: translateX(-50%) scaleX(0);
  opacity: 0;
  transition:
    opacity 120ms ease,
    transform 120ms ease;
  pointer-events: none;
}

.team-rail__team::before {
  top: calc(var(--space-6) * -0.5);
}

.team-rail__team::after {
  bottom: calc(var(--space-6) * -0.5);
}

.team-rail__team.list-reorder-drag--drop-before::before,
.team-rail__team.list-reorder-drag--drop-after::after {
  opacity: 1;
  transform: translateX(-50%) scaleX(1);
}

.team-rail__team.list-reorder-drag--dragging {
  opacity: 0.46;
}

.team-rail__team--active {
  color: var(--team-text-color);
  outline: 1px solid var(--color-primary);
  outline-offset: 2px;
}

.team-rail__unread-indicator {
  position: absolute;
  z-index: 2;
  top: -3px;
  right: -3px;
  width: 11px;
  height: 11px;
  border-radius: var(--radius-full);
  background: var(--color-error);
  pointer-events: none;
}

.team-rail__new {
  width: var(--team-rail-button-size);
  height: var(--team-rail-button-size);
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  cursor: pointer;
}

.team-rail__new:hover,
.team-rail__new:focus-visible {
  color: var(--color-text);
  border-color: var(--color-border-strong);
}

:deep() .settings-menu__trigger {
  display: grid;
  place-items: center;
  width: var(--team-rail-button-size);
  height: var(--team-rail-button-size);
  color: var(--team-rail-icon-color);
}

:deep() .settings-menu__trigger:hover,
:deep() .settings-menu__trigger:focus-visible {
  color: var(--team-rail-icon-hover-color);
  outline: none;
}

:deep() .settings-menu__trigger--active {
  color: var(--team-rail-icon-active-color);
}

.team-rail__bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
}
</style>
