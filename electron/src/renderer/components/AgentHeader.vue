<template>
  <header
    class="agent-header"
    :class="{ 'agent-header--with-sidebar-edge': !sidebarCollapsed }"
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
        size="sm"
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
          :data-status="agent?.status.type ?? backendRuntime.status"
          aria-hidden="true"
        />
        <strong>{{ activityTitle }}</strong>
      </div>
      <span
        v-if="hasHeaderGitStatus"
        class="agent-header__git-status"
      >
        <button
          v-if="gitStatus?.addedLines || gitStatus?.removedLines"
          class="agent-header__git-diff"
          aria-label="Open repository diff"
          type="button"
          @click="emit('open-git-diff')"
        >
          <CodexAnimatedDiffStat
            v-if="gitStatus?.addedLines"
            kind="added"
            label="Added lines"
            :value="gitStatus?.addedLines ?? 0"
          />
          <CodexAnimatedDiffStat
            v-if="gitStatus?.removedLines"
            kind="deleted"
            label="Removed lines"
            :value="gitStatus?.removedLines ?? 0"
          />
        </button>
      </span>
      <button
        class="agent-header__workspace"
        type="button"
        aria-label="Toggle right workspace"
        :title="workspaceOpen ? 'Close right workspace' : 'Open right workspace'"
        :aria-pressed="workspaceOpen"
        @click="emit('toggle-workspace')"
      >
        <IconLayoutSidebarRight aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Agent, AgentGitStatus, BackendRuntimeStatus } from '@codex-claw/shared/contracts';
import { PanelLeftOpenIcon } from '../shared/icons/app-icons';
import { IconLayoutSidebarRight } from '@tabler/icons-vue';
import { CodexAnimatedDiffStat } from 'codex-app-sdk/vue';
import AgentAvatar from './AgentAvatar.vue';

const props = defineProps<{
  agent: Agent | null;
  gitStatus?: AgentGitStatus | null;
  backendRuntime: BackendRuntimeStatus;
  workspaceOpen?: boolean;
  isLoading: boolean;
  sidebarCollapsed: boolean;
}>();

const emit = defineEmits<{
  'expand-sidebar': [];
  'toggle-workspace': [];
  'open-git-diff': [];
}>();

const statusLabel = computed(() => {
  if (props.isLoading) {
    return 'Loading';
  }

  if (props.backendRuntime.status === 'running') {
    return 'Connected';
  }

  if (props.backendRuntime.status === 'error') {
    return `${backendLabel.value} error`;
  }

  return `${backendLabel.value} pending`;
});
const backendLabel = computed(() => (props.backendRuntime.backend === 'claude' ? 'Claude' : 'Codex'));
const agentStateLabel = computed(() => {
  switch (props.agent?.status.type) {
    case 'working':
    case 'starting':
      return 'Working';
    case 'awaitingInput':
    case 'error':
      return 'Blocked';
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

const activityTitle = computed(() => agentStateLabel.value);
const hasHeaderGitStatus = computed(() => {
  const gitStatus = props.gitStatus;
  if (!gitStatus || gitStatus.state === 'unknown') {
    return false;
  }

  return Boolean(gitStatus.addedLines || gitStatus.removedLines);
});

</script>

<style scoped>
.agent-header {
  --agent-status-dot-size: 10px;
  flex: 0 0 var(--workbench-appbar-height);
  min-height: var(--workbench-appbar-height);
  display: flex;
  align-items: center;
  gap: var(--space-8);
  min-width: 0;
  padding: 0 var(--space-4) 0 var(--space-8);
  background: var(--color-shell-main);
  border-bottom: 1px solid var(--color-shell-appbar-divider);
  -webkit-app-region: drag;
}

.agent-header--with-sidebar-edge {
  position: relative;
  z-index: 1;
  box-shadow: var(--shadow-content-edge);
}

.agent-header__identity {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: var(--space-6);
  min-width: 0;
}

.agent-header__agent-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.agent-header__identity strong {
  color: var(--color-text);
  font-weight: var(--font-weight-bold);
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
  display: flex;
  align-items: center;
  gap: var(--space-6);
  min-width: 0;
  color: var(--color-text-muted);
  text-align: right;
}

.agent-header__workspace {
  -webkit-app-region: no-drag;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
}

.agent-header__workspace:hover,
.agent-header__workspace[aria-pressed='true'] {
  background: var(--color-surface-high);
  color: var(--color-text);
}

.agent-header__workspace :deep(svg) {
  width: var(--icon-md);
  height: var(--icon-md);
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
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-4);
  font-size: var(--font-size-13);
}

.agent-header__git-status > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-header__git-diff {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.agent-header__git-diff:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.agent-header:has(.agent-header__expand) {
  padding-left: var(--space-16);
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

</style>
