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
  --team-rail-width: var(--space-24);
  --team-rail-button-size: var(--space-16);
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
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text);
  background: var(--color-surface-lowest);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  line-height: 0;
  cursor: pointer;
}

.team-rail__team--active {
  color: var(--color-on-primary);
  background: var(--color-primary);
  border-color: var(--color-primary);
}
</style>
