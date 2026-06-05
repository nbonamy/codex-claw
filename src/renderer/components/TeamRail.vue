<template>
  <aside
    class="team-rail"
    aria-label="Teams"
  >
    <div class="team-rail__window-controls" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
    <button
      class="team-rail__team team-rail__team--active"
      type="button"
      :aria-label="activeAgent ? `Current agent ${activeAgent.name}` : 'Current agent'"
    >
      {{ initials }}
    </button>
    <button
      v-for="team in teams"
      :key="team.id"
      class="team-rail__team"
      type="button"
      :aria-label="team.name"
    >
      {{ team.avatar ?? team.name.slice(0, 2).toUpperCase() }}
    </button>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Agent, Team } from '../../shared/contracts';

const props = defineProps<{
  teams: Team[];
  activeAgent: Agent | null;
}>();

const initials = computed(() => {
  if (!props.activeAgent) {
    return 'CC';
  }

  return props.activeAgent.avatar ?? props.activeAgent.name.slice(0, 2).toUpperCase();
});
</script>

<style scoped>
.team-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cc-space-3);
  padding: var(--cc-space-4) var(--cc-space-2);
  background: var(--cc-rail-bg);
  border-right: 1px solid var(--cc-border-muted);
}

.team-rail__window-controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--cc-space-1);
  width: var(--cc-window-controls-width);
  margin-bottom: var(--cc-space-4);
}

.team-rail__window-controls span {
  width: var(--cc-window-control-size);
  height: var(--cc-window-control-size);
  border-radius: var(--cc-radius-pill);
  background: var(--cc-window-control);
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
