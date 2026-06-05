<template>
  <aside
    class="agent-sidebar"
    aria-label="Agents"
  >
    <header class="agent-sidebar__header">
      <strong>{{ teamTitle }}</strong>
      <el-tooltip
        content="Hide agent sidebar"
        placement="bottom"
      >
        <button
          class="agent-sidebar__collapse"
          type="button"
          aria-label="Hide agent sidebar"
          @click="emit('collapse-sidebar')"
        >
          <Fold class="agent-sidebar__collapse-icon" />
        </button>
      </el-tooltip>
    </header>

    <nav class="agent-sidebar__list">
      <button
        v-for="agent in agents"
        :key="agent.id"
        class="agent-sidebar__agent"
        :class="{ 'agent-sidebar__agent--active': agent.id === activeAgentId }"
        type="button"
        :aria-pressed="agent.id === activeAgentId"
        @click="emit('select-agent', agent.id)"
      >
        <span class="agent-sidebar__avatar">{{ agent.avatar ?? agent.name.slice(0, 2).toUpperCase() }}</span>
        <span class="agent-sidebar__meta">
          <strong>{{ agent.name }}</strong>
          <span>{{ agent.statusText || agent.folder }}</span>
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
        type="primary"
        class="agent-sidebar__new"
      >
        New Agent
      </el-button>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Fold } from '@element-plus/icons-vue';
import type { Agent, AgentStatus } from '../../shared/contracts';

const props = defineProps<{
  agents: Agent[];
  activeAgentId: string | null;
  teamName: string;
}>();

const emit = defineEmits<{
  'collapse-sidebar': [];
  'select-agent': [agentId: string];
}>();

const teamTitle = computed(() => props.teamName.toUpperCase());

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
  flex: 0 0 var(--cc-agent-sidebar-width);
  width: var(--cc-agent-sidebar-width);
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--cc-sidebar-bg);
  border-right: 1px solid var(--cc-border-muted);
  user-select: none;
}

.agent-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cc-space-3);
  min-width: 0;
  padding-left: var(--cc-space-5);
  border-bottom: 1px solid var(--cc-border-muted);
  color: var(--cc-text);
  --webkit-app-region: drag;
}

.agent-sidebar__header strong {
  min-width: 0;
  overflow: hidden;
  font: var(--cc-font-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-sidebar__collapse {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--cc-radius-1);
  color: var(--cc-text-muted);
  background: transparent;
  cursor: pointer;
}

.agent-sidebar__collapse:hover {
  background: var(--cc-control-hover-bg);
}

.agent-sidebar__collapse:focus-visible {
  outline: var(--cc-focus-ring-size) solid var(--cc-accent);
  outline-offset: 2px;
}

.agent-sidebar__collapse-icon {
  width: var(--cc-icon-size);
  height: var(--cc-icon-size);
}

.agent-sidebar__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: var(--cc-space-3) var(--cc-space-2);
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

.agent-sidebar__new {
  width: 100%;
  min-height: 48px;
  border-radius: var(--cc-radius-2);
  font-weight: var(--cc-font-weight-bold);
}

@media (max-width: 1100px) {
  .agent-sidebar {
    flex-basis: var(--cc-agent-sidebar-compact-width);
    width: var(--cc-agent-sidebar-compact-width);
    min-width: var(--cc-agent-sidebar-compact-min);
  }
}
</style>
