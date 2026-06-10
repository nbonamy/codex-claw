<template>
  <aside
    ref="railRoot"
    class="team-rail"
    aria-label="Teams"
  >
    <button
      class="team-rail__cockpit"
      :class="{ 'team-rail__cockpit--active': cockpitActive }"
      type="button"
      aria-label="Cockpit"
      :aria-pressed="cockpitActive"
      @click="emit('select-cockpit')"
    >
      <CompassIcon aria-hidden="true" />
    </button>

    <button
      v-for="team in teams"
      :key="team.id"
      class="team-rail__team"
      :class="[
        { 'team-rail__team--active': isTeamActive(team.id) },
        teamReorder.dropTargetClass(team.id),
      ]"
      type="button"
      v-bind="teamReorder.dragItemAttributes(team.id)"
      :style="{ backgroundColor: team.color ?? defaultTeamColor }"
      :aria-label="team.name"
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
    </button>

    <button
      class="team-rail__new"
      type="button"
      aria-label="Create team"
      @click="emit('new-team')"
    >
      <PlusIcon aria-hidden="true" />
    </button>

    <div class="team-rail__bottom">
      <button
        class="team-rail__loops"
        :class="{ 'team-rail__loops--active': loopsActive }"
        type="button"
        aria-label="Loops"
        :aria-pressed="loopsActive"
        @click="emit('select-loops')"
      >
        <InfinityIcon aria-hidden="true" />
      </button>

      <SettingsMenu
        :rate-limits="rateLimits"
        @open-settings="emit('open-settings')"
        @quit="emit('quit')"
      />
    </div>

    <TeamContextMenu
      v-if="contextMenuTeam"
      :team="contextMenuTeam"
      :can-close="canCloseContextTeam"
      :x="contextMenuPosition.x"
      :y="contextMenuPosition.y"
      @edit-team="selectEditTeam"
      @request-close-team="requestCloseTeam"
      @close="contextMenuTeamId = null"
    />
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { AccountRateLimits, ReorderTeamsInput, Team } from '../../shared/contracts';
import { defaultTeamColor } from '../../shared/team-colors';
import { teamInitials } from '../../shared/team-manager';
import { CompassIcon, InfinityIcon, PlusIcon } from '../shared/icons/app-icons';
import { useListReorderDrag } from '../shared/use-list-reorder-drag';
import SettingsMenu from './SettingsMenu.vue';
import TeamContextMenu from './TeamContextMenu.vue';
import { confirmCloseTeam } from './team-close-confirmation';

const props = defineProps<{
  teams: Team[];
  activeTeamId: string | null;
  cockpitActive?: boolean;
  loopsActive?: boolean;
  rateLimits?: AccountRateLimits;
}>();

const emit = defineEmits<{
  'close-team': [teamId: string];
  'edit-team': [teamId: string];
  'new-team': [];
  'open-settings': [];
  quit: [];
  'reorder-teams': [input: ReorderTeamsInput];
  'select-cockpit': [];
  'select-loops': [];
  'select-team': [teamId: string];
}>();

const railRoot = ref<HTMLElement | null>(null);
const contextMenuTeamId = ref<string | null>(null);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuTeam = computed(() => (
  contextMenuTeamId.value ? props.teams.find((team) => team.id === contextMenuTeamId.value) ?? null : null
));
const canCloseContextTeam = computed(() => Boolean(contextMenuTeam.value) && props.teams.length > 1);
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
  return !props.cockpitActive && !props.loopsActive && teamId === props.activeTeamId;
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
  --team-rail-scale: 1.1;
  --team-rail-width: calc(var(--space-24) * var(--team-rail-scale));
  --team-rail-button-size: calc(var(--space-16) * var(--team-rail-scale));
  --team-text-color: white;
  flex: 0 0 var(--team-rail-width);
  width: var(--team-rail-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-4);
  background: var(--color-shell-rail);
  user-select: none;
}

.team-rail__team {
  position: relative;
  width: var(--team-rail-button-size);
  height: var(--team-rail-button-size);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--team-text-color);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
  cursor: pointer;
}

.team-rail__cockpit,
.team-rail__loops {
  width: var(--team-rail-button-size);
  height: var(--team-rail-button-size);
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  cursor: pointer;
}

.team-rail__cockpit:hover,
.team-rail__cockpit:focus-visible,
.team-rail__cockpit--active,
.team-rail__loops:hover,
.team-rail__loops:focus-visible,
.team-rail__loops--active {
  color: white;
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.team-rail__cockpit svg,
.team-rail__loops svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
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
  box-shadow:
    0 0 0 2px var(--color-shell-rail),
    0 0 0 3px var(--color-primary);
}

.team-rail__new {
  width: var(--team-rail-button-size);
  height: var(--team-rail-button-size);
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  cursor: pointer;
}

.team-rail__new:hover,
.team-rail__new:focus-visible {
  color: var(--color-text);
  border-color: var(--color-border-strong);
}

.team-rail__new svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

:deep() .settings-menu__trigger {
  display: grid;
  place-items: center;
  width: var(--team-rail-button-size);
  height: var(--team-rail-button-size);
}

.team-rail__bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
}

</style>
