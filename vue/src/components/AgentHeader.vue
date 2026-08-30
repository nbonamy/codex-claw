<template>
  <header
    class="agent-header"
    :class="{ 'agent-header--with-sidebar-edge': !sidebarCollapsed }"
  >
    <button
      v-if="sidebarCollapsed"
      class="agent-header__expand"
      type="button"
      :aria-label="$t('surface.agentHeader.showAgentSidebar')"
      @click="emit('expand-sidebar')"
    >
      <PanelLeftOpenIcon class="agent-header__expand-icon" />
    </button>

    <div
      v-if="agent"
      class="agent-header__identity"
    >
      <AgentAvatar
        v-if="repositoryIcon"
        class="agent-header__avatar"
        :avatar="repositoryIcon"
        :name="displayName"
        size="sm"
      />
      <div class="agent-header__agent-line">
        <strong>{{ displayName }}</strong>
        <span
          class="agent-header__folder"
          :title="agent.folder"
        >
          {{ agentLocationLabel }}
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
      <strong>{{ $t('surface.agentHeader.noAgent') }}</strong>
    </div>

    <div class="agent-header__activity">
      <span
        v-if="hasHeaderGitStatus"
        class="agent-header__git-status"
      >
        <button
          v-if="gitStatus?.addedLines || gitStatus?.removedLines"
          class="agent-header__git-diff"
          :aria-label="$t('surface.agentHeader.openRepositoryDiff')"
          type="button"
          @click="emit('open-git-diff')"
        >
          <CodexAnimatedDiffStat
            v-if="gitStatus?.addedLines"
            kind="added"
            :label="$t('surface.agentHeader.addedLines')"
            :value="gitStatus?.addedLines ?? 0"
          />
          <CodexAnimatedDiffStat
            v-if="gitStatus?.removedLines"
            kind="deleted"
            :label="$t('surface.agentHeader.removedLines')"
            :value="gitStatus?.removedLines ?? 0"
          />
        </button>
      </span>
      <GitWorkflowControl
        v-if="gitReviewAvailable && agent"
        :agent="agent"
        :git-status="gitStatus"
        :get-workflow="getGitWorkflow"
        :generate-message="generateGitMessage"
        :commit-changes="commitGitChanges"
        :push-branch="pushGitBranch"
        :create-pull-request="createGitPullRequest"
        :merge-branch="mergeGitBranch"
      />
      <OpenInControl
        v-if="agent && openInAvailable && openInCatalog && openInCatalog.applications.length > 0"
        :application="effectiveOpenInApplication(agent, openInCatalog)"
        :catalog="openInCatalog"
        @open="emit('open-in', $event)"
      />
      <SubagentControl
        v-if="displaySubagentTree"
        :tree="displaySubagentTree"
        :selected-conversation-id="selectedSubagentConversationId"
        @select="emit('select-subagent', $event)"
      />
      <button
        v-if="executionPlanAvailable"
        class="agent-header__execution-plan"
        type="button"
        :aria-label="$t('surface.agentHeader.toggleExecutionPlan')"
        :title="$t('surface.agentHeader.toggleExecutionPlan')"
        :aria-pressed="executionPlanOpen"
        @click="emit('toggle-execution-plan')"
      >
        <ListIcon aria-hidden="true" />
      </button>
      <button
        class="agent-header__workspace"
        type="button"
        :aria-label="$t('surface.agentHeader.toggleRightWorkspace')"
        :title="workspaceOpen ? $t('surface.agentHeader.closeRightWorkspace') : $t('surface.agentHeader.openRightWorkspace')"
        :aria-pressed="workspaceOpen"
        @click="emit('toggle-workspace')"
      >
        <IconLayoutSidebarRight aria-hidden="true" />
      </button>
      <UpdateAvailableBadge
        v-if="updateStatus"
        :status="updateStatus"
        @install="emit('install-update')"
      />
    </div>
  </header>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { localizedText } from '../i18n/errors';
import { computed } from 'vue';
import type { Agent, AgentGitStatus, AgentSubagentTree, BackendRuntimeStatus, DesktopUpdateStatus, OpenInApplication, OpenInApplicationCatalog } from '@codex-claw/core/contracts';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import { ListIcon, PanelLeftOpenIcon } from '../shared/icons/app-icons';
import { IconLayoutSidebarRight } from '@tabler/icons-vue';
import { CodexAnimatedDiffStat } from '@codex-app-sdk/vue';
import AgentAvatar from './AgentAvatar.vue';
import UpdateAvailableBadge from './UpdateAvailableBadge.vue';
import OpenInControl from '../shared/OpenInControl.vue';
import SubagentControl from './SubagentControl.vue';
import GitWorkflowControl from './GitWorkflowControl.vue';
import { effectiveOpenInApplication } from '../shared/open-in';

const props = defineProps<{
  agent: Agent | null;
  repositoryIcon?: string;
  gitStatus?: AgentGitStatus | null;
  backendRuntime: BackendRuntimeStatus;
  workspaceOpen?: boolean;
  isLoading: boolean;
  sidebarCollapsed: boolean;
  updateStatus?: DesktopUpdateStatus;
  executionPlanAvailable?: boolean;
  executionPlanOpen?: boolean;
  openInAvailable?: boolean;
  openInCatalog?: OpenInApplicationCatalog;
  subagentTree?: AgentSubagentTree | null;
  selectedSubagentConversationId?: string | null;
  getGitWorkflow?: (agentId: string) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  generateGitMessage?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitMessageGenerationInput) => Promise<import('@codex-claw/core/contracts').AgentGitMessageGenerationResult>;
  commitGitChanges?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitCommitInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  pushGitBranch?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitPushInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  createGitPullRequest?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitPullRequestInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  mergeGitBranch?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitMergeInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
}>();

const emit = defineEmits<{
  'expand-sidebar': [];
  'toggle-workspace': [];
  'toggle-execution-plan': [];
  'open-git-diff': [];
  'install-update': [];
  'open-in': [application: OpenInApplication];
  'select-subagent': [conversationId: string];
}>();

const displayName = computed(() => props.agent ? agentDisplayName(props.agent) : '');

const displaySubagentTree = computed(() => {
  const tree = props.subagentTree;
  return tree && Object.values(tree.nodes).some((node) => node.conversationId !== tree.rootConversationId)
    ? tree
    : null;
});

const statusLabel = computed(() => {
  if (props.isLoading) {
    return translate('surface.agentHeader.loading');
  }

  if (props.backendRuntime.status === 'running') {
    return translate('surface.agentHeader.connected');
  }

  if (props.backendRuntime.status === 'error') {
    return `${backendLabel.value} error`;
  }

  return `${backendLabel.value} pending`;
});
const backendLabel = computed(() => (props.backendRuntime.backend === 'claude' ? translate('surface.agentHeader.claude') : translate('surface.agentHeader.codex')));
const agentLocationLabel = computed(() => {
  const agent = props.agent;
  const gitStatus = props.gitStatus;
  if (!agent || !gitStatus || gitStatus.state === 'unknown' || !gitStatus.branch) {
    return agent?.folder ?? '';
  }

  const repository = gitStatus.repository ?? gitStatus.folder
    .replace(/[\\/]+$/u, '')
    .split(/[\\/]/u)
    .filter(Boolean)
    .at(-1);

  return repository ? `${gitStatus.branch} @ ${repository}` : agent.folder;
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
      return localizedText(props.agent.status.detail, translate) ?? translate('status.working');
    case 'starting':
      return translate('surface.agentHeader.starting');
    case 'awaitingInput':
      return localizedText(props.agent.status.detail, translate) ?? translate('dynamic.misc.awaitingInput');
    case 'error':
      return localizedText(props.agent.status.message, translate);
    case 'idle':
      return translate('surface.agentHeader.readyToGetGoing');
  }
});

const hasHeaderGitStatus = computed(() => {
  const gitStatus = props.gitStatus;
  return Boolean(gitStatus && gitStatus.state !== 'unknown' && (gitStatus.addedLines || gitStatus.removedLines));
});

const gitReviewAvailable = computed(() => {
  const gitStatus = props.gitStatus;
  return Boolean(gitStatus && gitStatus.state !== 'unknown');
});

</script>

<style scoped>
.agent-header {
  --agent-status-dot-size: 10px;
  position: relative;
  z-index: 5;
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

.agent-header__inline-dot {
  flex: 0 0 auto;
  width: var(--agent-status-dot-size);
  height: var(--agent-status-dot-size);
  border-radius: var(--radius-full);
  background: var(--color-outline);
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

.agent-header__execution-plan {
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

.agent-header__execution-plan:hover,
.agent-header__execution-plan[aria-pressed="true"] {
  background: var(--color-surface-high);
  color: var(--color-text);
}

.agent-header__execution-plan :deep(svg) {
  width: var(--icon-md);
  height: var(--icon-md);
}

.agent-header__workspace:hover,
.agent-header__workspace[aria-pressed="true"] {
  background: var(--color-surface-high);
  color: var(--color-text);
}

.agent-header__workspace :deep(svg) {
  width: var(--icon-md);
  height: var(--icon-md);
}

.agent-header__git-status {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
