<template>
  <header class="agent-header">
    <div
      v-if="agent"
      class="agent-header__identity"
    >
      <span class="agent-header__avatar">{{ agent.avatar ?? agent.name.slice(0, 2).toUpperCase() }}</span>
      <div>
        <strong>{{ agent.name }}</strong>
        <span>{{ agent.folder }}</span>
      </div>
    </div>
    <div
      v-else
      class="agent-header__identity"
    >
      <strong>No agent</strong>
    </div>
    <div
      v-if="agent"
      class="agent-header__context"
    >
      <span>codex</span>
      <span>{{ agent.status.type }}</span>
    </div>
    <div class="agent-header__status">
      <span :data-status="appServer.status" />
      {{ statusLabel }}
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Agent, AppSnapshot } from '../../shared/contracts';

const props = defineProps<{
  agent: Agent | null;
  appServer: AppSnapshot['appServer'];
  isLoading: boolean;
}>();

const statusLabel = computed(() => {
  if (props.isLoading) {
    return 'Loading';
  }

  if (props.appServer.status === 'running') {
    return 'Connected';
  }

  if (props.appServer.status === 'error') {
    return 'Codex error';
  }

  return 'Codex pending';
});
</script>

<style scoped>
.agent-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--cc-space-4);
  padding: 0 var(--cc-space-5);
  background: var(--cc-header-bg);
  border-bottom: 1px solid var(--cc-border-muted);
}

.agent-header__identity {
  display: flex;
  align-items: center;
  gap: var(--cc-space-3);
  min-width: 0;
}

.agent-header__avatar {
  display: grid;
  place-items: center;
  width: var(--cc-avatar-size-small);
  height: var(--cc-avatar-size-small);
  border-radius: var(--cc-radius-pill);
  background: var(--cc-avatar-bg);
  color: var(--cc-avatar-text);
  font: var(--cc-font-label);
}

.agent-header__identity div {
  min-width: 0;
  display: grid;
}

.agent-header__identity strong {
  color: var(--cc-text);
  font-weight: var(--cc-font-weight-bold);
}

.agent-header__identity span {
  color: var(--cc-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-header__context {
  display: inline-flex;
  gap: var(--cc-space-2);
  align-items: center;
  color: var(--cc-text-muted);
  font: var(--cc-font-body-small);
}

.agent-header__context span:first-child {
  color: var(--cc-text);
}

.agent-header__status {
  display: inline-flex;
  align-items: center;
  gap: var(--cc-space-2);
  color: var(--cc-text-muted);
}

.agent-header__status span {
  width: var(--cc-status-dot-size);
  height: var(--cc-status-dot-size);
  border-radius: var(--cc-radius-pill);
  background: var(--cc-status-warning);
}

.agent-header__status span[data-status='running'] {
  background: var(--cc-status-success);
}

.agent-header__status span[data-status='error'] {
  background: var(--cc-status-danger);
}
</style>
