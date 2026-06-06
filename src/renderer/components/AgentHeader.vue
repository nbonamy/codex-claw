<template>
  <header
    class="agent-header"
    :class="{ 'agent-header--sidebar-collapsed': sidebarCollapsed }"
  >
    <button
      v-if="sidebarCollapsed"
      class="agent-header__expand"
      type="button"
      aria-label="Show agent sidebar"
      @click="emit('expand-sidebar')"
    >
      <PanelLeftOpenIcon class="agent-header__expand-icon" />
    </button>

    <div
      v-if="agent"
      class="agent-header__identity"
    >
      <AgentAvatar
        class="agent-header__avatar"
        :avatar="agent.avatar"
        :name="agent.name"
        :size="sidebarCollapsed ? 'xs' : 'md'"
      />
      <div class="agent-header__agent-line">
        <strong>{{ agent.name }}</strong>
        <span
          class="agent-header__folder"
        >
          {{ agent.folder }}
        </span>
        <span
          class="agent-header__inline-dot"
          :data-status="agent.status.type"
          aria-hidden="true"
        />
        <span
          class="agent-header__inline-status"
        >
          {{ agentStatusDetail }}
        </span>
      </div>
    </div>
    <div
      v-else
      class="agent-header__identity"
    >
      <strong>No agent</strong>
    </div>

    <div class="agent-header__activity">
      <div class="agent-header__activity-line">
        <span
          :data-status="agent?.status.type ?? appServer.status"
          aria-hidden="true"
        />
        <strong>{{ activityTitle }}</strong>
      </div>
      <span
        v-if="!sidebarCollapsed"
        class="agent-header__git-status"
      >
        {{ gitStatusLabel }}
      </span>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Agent, AppSnapshot } from '../../shared/contracts';
import { PanelLeftOpenIcon } from '../shared/icons/app-icons';
import AgentAvatar from './AgentAvatar.vue';

const props = defineProps<{
  agent: Agent | null;
  appServer: AppSnapshot['appServer'];
  isLoading: boolean;
  sidebarCollapsed: boolean;
}>();

const emit = defineEmits<{
  'expand-sidebar': [];
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
const agentStatusLabel = computed(() => {
  switch (props.agent?.status.type) {
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
    default:
      return statusLabel.value;
  }
});
const agentStatusDetail = computed(() => {
  if (!props.agent) {
    return statusLabel.value;
  }

  if (props.agent.statusText) {
    return props.agent.statusText;
  }

  switch (props.agent.status.type) {
    case 'working':
      return props.agent.status.detail ?? 'Working';
    case 'starting':
      return 'Starting';
    case 'awaitingInput':
      return props.agent.status.detail ?? 'Awaiting input';
    case 'error':
      return props.agent.status.message;
    case 'idle':
      return 'Ready to get going';
  }
});
const activityTitle = computed(() => agentStatusLabel.value);
const gitStatusLabel = computed(() => 'Git status pending');
</script>

<style scoped>
.agent-header {
  --agent-header-height: 64px;
  --agent-header-avatar-size: 38px;
  --agent-status-dot-size: 10px;
  flex: 0 0 var(--agent-header-height);
  min-height: var(--agent-header-height);
  display: flex;
  align-items: center;
  gap: var(--space-8);
  min-width: 0;
  padding: 0 var(--space-12);
  background: var(--color-surface-lowest);
  border-bottom: 1px solid var(--color-border);
  -webkit-app-region: drag;
}

.agent-header--sidebar-collapsed {
  flex-basis: var(--workbench-appbar-height);
  min-height: var(--workbench-appbar-height);
  max-height: var(--workbench-appbar-height);
  align-items: center;
  gap: var(--space-6);
  padding-left: var(--space-16);
  border-bottom-color: transparent;
}

.agent-header__identity {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  min-width: 0;
}

.agent-header__avatar {
  --agent-avatar-size: var(--agent-header-avatar-size);
  --agent-avatar-font-size: var(--font-size-15);
}

.agent-header--sidebar-collapsed .agent-header__avatar {
  --agent-avatar-size: var(--space-8);
  --agent-avatar-font-size: var(--font-size-8);
}

.agent-header__agent-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.agent-header__identity strong {
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}

.agent-header__identity .agent-header__agent-line {
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-header__inline-dot,
.agent-header__activity-line > span {
  flex: 0 0 auto;
  width: var(--agent-status-dot-size);
  height: var(--agent-status-dot-size);
  border-radius: var(--radius-full);
}

.agent-header__inline-dot {
  background: var(--color-outline);
}

.agent-header__activity-line > span {
  background: var(--color-success);
}

.agent-header__activity-line > span[data-status='working'],
.agent-header__activity-line > span[data-status='starting'] {
  background: var(--color-warning);
}

.agent-header__activity-line > span[data-status='awaitingInput'],
.agent-header__activity-line > span[data-status='notConfigured'] {
  background: var(--color-warning);
}

.agent-header__activity-line > span[data-status='error'] {
  background: var(--color-error);
}

.agent-header__activity-line > span[data-status='running'] {
  background: var(--color-success);
}

.agent-header__inline-status {
  min-width: 0;
  color: var(--color-text-muted);
}

.agent-header__activity {
  flex: 0 0 auto;
  display: grid;
  gap: var(--space-1);
  min-width: 152px;
  color: var(--color-text-muted);
  text-align: right;
}

.agent-header--sidebar-collapsed .agent-header__activity {
  min-width: auto;
}

.agent-header__activity-line {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-4);
  min-width: 0;
}

.agent-header__activity-line strong,
.agent-header__git-status {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-header__activity-line strong {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-medium);
}

.agent-header__git-status {
  font-size: var(--font-size-13);
}

.agent-header__expand {
  display: flex;
  align-items: center;
  padding: 0;
  border: none;
  background: transparent;
  -webkit-app-region: no-drag;
}

.agent-header__expand-icon {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.agent-header--sidebar-collapsed .agent-header__identity,
.agent-header--sidebar-collapsed .agent-header__activity {
  font-size: var(--font-size-13);
}



</style>
