<template>
  <span
    class="cockpit-icon"
    aria-hidden="true"
  >
    <span
      v-for="(square, index) in squares"
      :key="index"
      class="cockpit-icon__square"
      :style="{ backgroundColor: square.color ?? 'transparent', borderColor: square.color ?? undefined }"
    />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Team } from '../../shared/contracts';

const props = defineProps<{
  teams: Pick<Team, 'color'>[];
}>();

const squares = computed(() => Array.from({ length: 4 }, (_, index) => ({
  color: props.teams[index]?.color ?? null,
})));
</script>

<style scoped>
.cockpit-icon {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  width: 26px;
  height: 26px;
  padding: 0;
}

.cockpit-icon__square {
  min-width: 0;
  min-height: 0;
  border: 2px solid var(--color-border-strong);
  border-radius: 4px;
}

</style>
