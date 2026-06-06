<template>
  <section
    class="agent-empty-state"
    aria-label="No agents"
  >

    <div class="agent-empty-state__drag">
    </div>

    <div class="agent-empty-state__mark">
      <img
        :src="appIconUrl"
        alt="Codex Claw"
      >
    </div>

    <div class="agent-empty-state__copy">
      <h1>Welcome to Codex Claw!</h1>
      <p>Add an agent to your team</p>
    </div>

    <div class="agent-empty-state__new">
      <NewAgentButton
        :bench="bench"
        @deploy-bench-template="emit('deploy-bench-template', $event)"
        @new-agent="emit('new-agent')"
        @remove-bench-template="emit('remove-bench-template', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BenchTemplate } from '../../shared/contracts';
import NewAgentButton from './NewAgentButton.vue';

const appIconUrl = new URL('../../../assets/icon.png', import.meta.url).href;

const props = defineProps<{
  bench?: BenchTemplate[];
}>();

const emit = defineEmits<{
  'deploy-bench-template': [templateId: string];
  'new-agent': [];
  'remove-bench-template': [templateId: string];
}>();

const bench = computed(() => props.bench ?? []);
</script>

<style scoped>
.agent-empty-state {
  width: 100%;
  height: 100%;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: var(--space-16);
  padding: var(--space-16);
  color: var(--color-text);
  background: var(--color-background);
}

.agent-empty-state__drag {
  position: absolute;
  top: 0;
  width: 100%;
  height: 30vh;
  -webkit-app-region: drag;
}

.agent-empty-state__mark {
  width: 112px;
  height: 112px;
  display: grid;
  place-items: center;
  color: var(--color-text);
  overflow: hidden;
}

.agent-empty-state__mark img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.agent-empty-state__copy {
  display: grid;
  gap: var(--space-2);
  text-align: center;
}

.agent-empty-state__copy h1,
.agent-empty-state__copy p {
  margin: 0;
}

.agent-empty-state__copy h1 {
  font-size: var(--font-size-24);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-32);
}

.agent-empty-state__copy p {
  color: var(--color-text-muted);
  font-size: var(--font-size-20);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-28);
}

.agent-empty-state__new {
  width: min(240px, 100%);
}
</style>
