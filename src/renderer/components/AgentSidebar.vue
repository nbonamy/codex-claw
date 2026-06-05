<template>
  <aside
    class="agent-sidebar"
    aria-label="Agents"
  >
    <header class="agent-sidebar__header">
      <strong>Codex Claw</strong>
      <span>Bench {{ benchCount }}</span>
    </header>

    <nav class="agent-sidebar__list">
      <button
        v-for="agent in agents"
        :key="agent.id"
        class="agent-sidebar__agent"
        :class="{ 'agent-sidebar__agent--active': agent.id === activeAgentId }"
        type="button"
      >
        <span class="agent-sidebar__avatar">{{ agent.avatar ?? agent.name.slice(0, 2).toUpperCase() }}</span>
        <span class="agent-sidebar__meta">
          <strong>{{ agent.name }}</strong>
          <span>{{ agent.folder }}</span>
        </span>
        <span
          class="agent-sidebar__status"
          :data-status="agent.status.type"
          :aria-label="agentStatusLabel(agent.status.type)"
        />
      </button>
    </nav>

    <footer class="agent-sidebar__footer">
      <el-button
        class="agent-sidebar__folder"
        @click="$emit('selectFolder')"
      >
        Change Folder
      </el-button>
      <el-button
        type="primary"
        class="agent-sidebar__new"
      >
        New Agent
      </el-button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import type { Agent, AgentStatus } from '../../shared/contracts';

defineProps<{
  agents: Agent[];
  activeAgentId: string | null;
  benchCount: number;
}>();

defineEmits<{
  selectFolder: [];
}>();

function agentStatusLabel(status: AgentStatus['type']): string {
  switch (status) {
    case 'working':
      return 'Working';
    case 'starting':
      return 'Starting';
    case 'awaitingInput':
      return 'Awaiting input';
    case 'error':
      return 'Error';
    case 'idle':
      return 'Idle';
  }
}
</script>

<style scoped>
.agent-sidebar {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: var(--cc-sidebar-bg);
  border-right: 1px solid var(--cc-border-muted);
}

.agent-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--cc-space-5) var(--cc-space-4) var(--cc-space-3);
  color: var(--cc-text);
}

.agent-sidebar__header span {
  color: var(--cc-text-muted);
  font: var(--cc-font-caption);
}

.agent-sidebar__list {
  min-height: 0;
  overflow: auto;
  padding: var(--cc-space-2);
}

.agent-sidebar__agent {
  width: 100%;
  min-height: var(--cc-agent-row-min-height);
  display: grid;
  grid-template-columns: var(--cc-avatar-size) minmax(0, 1fr) var(--cc-agent-status-column-width);
  align-items: center;
  gap: var(--cc-space-3);
  margin-bottom: var(--cc-space-2);
  padding: var(--cc-space-3);
  border: 1px solid transparent;
  border-radius: var(--cc-radius-2);
  color: var(--cc-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.agent-sidebar__agent--active {
  background: var(--cc-selection-bg);
  border-color: var(--cc-selection-border);
}

.agent-sidebar__avatar {
  display: grid;
  place-items: center;
  width: var(--cc-avatar-size);
  height: var(--cc-avatar-size);
  border-radius: var(--cc-radius-pill);
  background: var(--cc-avatar-bg);
  color: var(--cc-avatar-text);
  font: var(--cc-font-label);
}

.agent-sidebar__meta {
  min-width: 0;
  display: grid;
  gap: var(--cc-meta-gap);
}

.agent-sidebar__meta strong,
.agent-sidebar__meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-sidebar__meta span {
  color: var(--cc-text-muted);
  font: var(--cc-font-body-small);
}

.agent-sidebar__status {
  width: var(--cc-status-dot-size);
  height: var(--cc-status-dot-size);
  border-radius: var(--cc-radius-pill);
  background: var(--cc-status-idle);
}

.agent-sidebar__status[data-status='working'],
.agent-sidebar__status[data-status='starting'] {
  background: var(--cc-status-working);
}

.agent-sidebar__status[data-status='awaitingInput'] {
  background: var(--cc-status-warning);
}

.agent-sidebar__status[data-status='error'] {
  background: var(--cc-status-danger);
}

.agent-sidebar__footer {
  display: grid;
  gap: var(--cc-space-2);
  padding: var(--cc-space-3);
  border-top: 1px solid var(--cc-border-muted);
}

.agent-sidebar__folder,
.agent-sidebar__new {
  width: 100%;
}
</style>
