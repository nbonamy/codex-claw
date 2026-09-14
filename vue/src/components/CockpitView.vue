<template>
  <section class="agent-cockpit" :aria-label="$t('surface.cockpitView.agents')">
    <header class="agent-cockpit__header">
      <div>
        <h1>{{ $t('surface.cockpitView.agents') }}</h1>
        <span>{{ agents.length }}</span>
      </div>
      <el-tabs
        v-model="selectedViewMode"
        class="agent-cockpit__mode"
        :aria-label="$t('surface.cockpitAgentsView.layout')"
      >
        <el-tab-pane
          :label="$t('surface.cockpitAgentsView.teams')"
          name="teams"
        />
        <el-tab-pane
          :label="$t('surface.cockpitAgentsView.recent')"
          name="recent"
        />
      </el-tabs>
    </header>

    <CockpitAgentsView
      :agents="agents"
      :forkable-agent-ids="forkableAgentIds"
      :mode="viewMode"
      :repository-icons="repositoryIcons"
      :teams="teams"
      @add-agent="emit('add-agent', $event)"
      @close-agent="emit('close-agent', $event)"
      @duplicate-agent="emit('duplicate-agent', $event)"
      @edit-agent="emit('edit-agent', $event)"
      @fork-agent="emit('fork-agent', $event)"
      @move-agent-to-team="emit('move-agent-to-team', $event)"
      @prompt-agent="emit('prompt-agent', $event)"
      @restart-agent="emit('restart-agent', $event)"
      @select-agent="emit('select-agent', $event)"
      @select-team="emit('select-team', $event)"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Agent, CockpitAgentViewMode, Team } from '@codex-claw/core/contracts';
import CockpitAgentsView from './CockpitAgentsView.vue';

const props = defineProps<{
  agents: Agent[];
  forkableAgentIds?: string[];
  repositoryIcons?: Record<string, string>;
  teams: Team[];
  viewMode: CockpitAgentViewMode;
}>();

const emit = defineEmits<{
  'add-agent': [teamId: string];
  'close-agent': [agentId: string];
  'duplicate-agent': [agentId: string];
  'edit-agent': [agentId: string];
  'fork-agent': [agentId: string];
  'move-agent-to-team': [payload: { agentId: string; teamId: string }];
  'prompt-agent': [payload: { agentId: string; prompt: string }];
  'restart-agent': [agentId: string];
  'select-agent': [payload: { agentId: string; teamId: string }];
  'select-team': [teamId: string];
  'update-view-mode': [mode: CockpitAgentViewMode];
}>();

const selectedViewMode = computed({
  get: () => props.viewMode,
  set: (value: string) => {
    if (value === 'teams' || value === 'recent') emit('update-view-mode', value);
  },
});
</script>

<style scoped>
.agent-cockpit {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-shell-main);
}

.agent-cockpit__header,
.agent-cockpit__header > div {
  display: flex;
  align-items: center;
}

.agent-cockpit__header {
  height: var(--workbench-appbar-height);
  flex: 0 0 var(--workbench-appbar-height);
  justify-content: space-between;
  gap: var(--space-16);
  padding: 0 var(--space-20);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

.agent-cockpit__header > div {
  min-width: 0;
  gap: var(--space-8);
}

.agent-cockpit__header h1 {
  margin: 0;
  font-size: var(--font-size-28);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-32);
  letter-spacing: -0.02em;
}

.agent-cockpit__header span {
  min-width: 28px;
  border-radius: var(--radius-full);
  padding: 2px var(--space-4);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  font-size: var(--font-size-12);
  text-align: center;
}

.agent-cockpit__mode {
  flex: 0 0 auto;
  -webkit-app-region: no-drag;
}

.agent-cockpit__mode :deep(.el-tabs__header) {
  margin: 0;
}

.agent-cockpit__mode :deep(.el-tabs__content) {
  display: none;
}

.agent-cockpit__mode :deep(.el-tabs__active-bar) {
  display: none;
}

.agent-cockpit__mode :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.agent-cockpit__mode :deep(.el-tabs__item:focus-visible) {
  color: var(--color-primary);
  box-shadow: none;
}
</style>
