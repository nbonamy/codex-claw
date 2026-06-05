<template>
  <header
    class="agent-header"
    :class="{ 'agent-header--sidebar-collapsed': sidebarCollapsed }"
  >
    <el-tooltip
      v-if="sidebarCollapsed"
      content="Show agent sidebar"
      placement="bottom"
    >
      <button
        class="agent-header__expand"
        type="button"
        aria-label="Show agent sidebar"
        @click="emit('expand-sidebar')"
      >
        <Expand class="agent-header__expand-icon" />
      </button>
    </el-tooltip>

    <div
      v-if="agent"
      class="agent-header__identity"
    >
      <span class="agent-header__avatar">{{ agent.avatar ?? agent.name.slice(0, 2).toUpperCase() }}</span>
      <div class="agent-header__agent-line">
        <strong>{{ agent.name }}</strong>
        <span
          v-if="!sidebarCollapsed"
          class="agent-header__folder"
        >
          {{ agent.folder }}
        </span>
        <span
          v-if="!sidebarCollapsed"
          class="agent-header__inline-dot"
          :data-status="agent.status.type"
          aria-hidden="true"
        />
        <span
          v-if="!sidebarCollapsed"
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
import { Expand } from '@element-plus/icons-vue';
import type { Agent, AppSnapshot } from '../../shared/contracts';

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
  flex: 0 0 var(--cc-header-height);
  min-height: var(--cc-header-height);
  display: flex;
  align-items: center;
  gap: var(--cc-space-4);
  min-width: 0;
  padding: 0 var(--cc-space-5);
  background: var(--cc-header-bg);
  border-bottom: 1px solid var(--cc-border-muted);
}

.agent-header--sidebar-collapsed {
  min-height: 0;
  gap: var(--cc-space-3);
  padding-left: var(--cc-space-3);
}

.agent-header__expand {
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

.agent-header__expand:hover {
  background: var(--cc-control-hover-bg);
}

.agent-header__expand:focus-visible {
  outline: var(--cc-focus-ring-size) solid var(--cc-accent);
  outline-offset: 2px;
}

.agent-header__expand-icon {
  width: var(--cc-icon-size);
  height: var(--cc-icon-size);
}

.agent-header__identity {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: var(--cc-space-3);
  min-width: 0;
}

.agent-header__avatar {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: var(--cc-avatar-size-small);
  height: var(--cc-avatar-size-small);
  border-radius: var(--cc-radius-pill);
  background: var(--cc-avatar-bg);
  color: var(--cc-avatar-text);
  font: var(--cc-font-label);
}

.agent-header--sidebar-collapsed .agent-header__avatar {
  width: 34px;
  height: 34px;
  font-size: var(--cc-font-size-small);
}

.agent-header__agent-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--cc-space-3);
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

.agent-header__inline-dot,
.agent-header__activity-line > span {
  flex: 0 0 auto;
  width: var(--cc-status-dot-size);
  height: var(--cc-status-dot-size);
  border-radius: var(--cc-radius-pill);
  background: var(--cc-status-idle);
}

.agent-header__inline-dot[data-status='working'],
.agent-header__inline-dot[data-status='starting'],
.agent-header__activity-line > span[data-status='working'],
.agent-header__activity-line > span[data-status='starting'] {
  background: var(--cc-status-working);
}

.agent-header__inline-dot[data-status='awaitingInput'],
.agent-header__activity-line > span[data-status='awaitingInput'],
.agent-header__activity-line > span[data-status='notConfigured'] {
  background: var(--cc-status-warning);
}

.agent-header__inline-dot[data-status='error'],
.agent-header__activity-line > span[data-status='error'] {
  background: var(--cc-status-danger);
}

.agent-header__activity-line > span[data-status='running'] {
  background: var(--cc-status-success);
}

.agent-header__inline-status {
  min-width: 0;
  color: var(--cc-text-muted);
}

.agent-header--sidebar-collapsed .agent-header__folder,
.agent-header--sidebar-collapsed .agent-header__inline-dot,
.agent-header--sidebar-collapsed .agent-header__inline-status {
  display: none;
}

.agent-header__activity {
  flex: 0 0 auto;
  display: grid;
  gap: var(--cc-meta-gap);
  min-width: 152px;
  color: var(--cc-text-muted);
  text-align: right;
}

.agent-header--sidebar-collapsed .agent-header__activity {
  min-width: auto;
}

.agent-header__activity-line {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--cc-space-2);
  min-width: 0;
}

.agent-header__activity-line strong,
.agent-header__git-status {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-header__activity-line strong {
  color: var(--cc-text-muted);
  font-weight: var(--cc-font-weight-bold);
}

.agent-header__git-status {
  font: var(--cc-font-body-small);
}
</style>
