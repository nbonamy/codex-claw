<template>
  <aside
    ref="railRoot"
    class="team-rail"
    aria-label="Teams"
  >
    <button
      v-for="team in teams"
      :key="team.id"
      class="team-rail__team"
      :class="{ 'team-rail__team--active': team.id === activeTeamId }"
      type="button"
      :style="{ backgroundColor: team.color ?? defaultTeamColor }"
      :aria-label="team.name"
      :aria-pressed="team.id === activeTeamId"
      @click="emit('select-team', team.id)"
      @contextmenu.prevent="openTeamMenu(team.id, $event)"
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

    <SettingsMenu
      :rate-limits="rateLimits"
      @open-settings="emit('open-settings')"
      @quit="emit('quit')"
    />

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
import { ElMessageBox } from 'element-plus';
import type { AccountRateLimits, Team } from '../../shared/contracts';
import { defaultTeamColor } from '../../shared/team-colors';
import { teamInitials } from '../../shared/team-manager';
import { PlusIcon } from '../shared/icons/app-icons';
import SettingsMenu from './SettingsMenu.vue';
import TeamContextMenu from './TeamContextMenu.vue';

const props = defineProps<{
  teams: Team[];
  activeTeamId: string | null;
  rateLimits?: AccountRateLimits;
}>();

const emit = defineEmits<{
  'close-team': [teamId: string];
  'edit-team': [teamId: string];
  'new-team': [];
  'open-settings': [];
  quit: [];
  'select-team': [teamId: string];
}>();

const railRoot = ref<HTMLElement | null>(null);
const contextMenuTeamId = ref<string | null>(null);
const contextMenuPosition = ref({ x: 0, y: 0 });
const contextMenuTeam = computed(() => (
  contextMenuTeamId.value ? props.teams.find((team) => team.id === contextMenuTeamId.value) ?? null : null
));
const canCloseContextTeam = computed(() => Boolean(contextMenuTeam.value) && props.teams.length > 1);
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

  try {
    await ElMessageBox.confirm(
      `Agents and messages in ${team.name} will be removed from Codex Claw.`,
      `Close ${team.name}?`,
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Close Team',
        type: 'warning',
      },
    );
    emit('close-team', team.id);
  } catch {
    // Element Plus rejects when the user cancels or closes the confirmation.
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
  flex: 0 0 var(--team-rail-width);
  width: var(--team-rail-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-4);
  background: var(--color-surface);
  user-select: none;
}

.team-rail__team {
  width: var(--team-rail-button-size);
  height: var(--team-rail-button-size);
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-on-primary);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-16);
  cursor: pointer;
}

.team-rail__team--active {
  color: var(--color-on-primary);
  box-shadow:
    0 0 0 2px var(--color-surface),
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
  background: var(--color-surface-lowest);
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
  margin-top: auto;
}

</style>
