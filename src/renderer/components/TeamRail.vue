<template>
  <aside
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
  </aside>
</template>

<script setup lang="ts">
import type { Team } from '../../shared/contracts';
import { defaultTeamColor } from '../../shared/team-colors';
import { teamInitials } from '../../shared/team-manager';
import { PlusIcon } from '../shared/icons/app-icons';

defineProps<{
  teams: Team[];
  activeTeamId: string | null;
}>();

const emit = defineEmits<{
  'new-team': [];
  'select-team': [teamId: string];
}>();
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
</style>
