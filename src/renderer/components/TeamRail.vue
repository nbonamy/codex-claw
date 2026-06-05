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
      :aria-label="team.name"
      :aria-pressed="team.id === activeTeamId"
    >
      {{ team.avatar ?? team.name.slice(0, 2).toUpperCase() }}
    </button>
  </aside>
</template>

<script setup lang="ts">
import type { Team } from '../../shared/contracts';

defineProps<{
  teams: Team[];
  activeTeamId: string | null;
}>();
</script>

<style scoped>
.team-rail {
  flex: 0 0 var(--cc-team-rail-width);
  width: var(--cc-team-rail-width);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cc-space-3);
  padding: var(--cc-space-3) var(--cc-space-2);
  background: var(--cc-rail-bg);
}

.team-rail__team {
  width: var(--cc-team-button-size);
  height: var(--cc-team-button-size);
  border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius-pill);
  color: var(--cc-text);
  background: var(--cc-rail-item-bg);
  font: var(--cc-font-label);
  cursor: pointer;
}

.team-rail__team--active {
  color: var(--cc-text-inverse);
  background: var(--cc-accent);
  border-color: var(--cc-accent);
}
</style>
