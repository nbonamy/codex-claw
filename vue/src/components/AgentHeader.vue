<template>
  <header
    class="agent-header"
    :class="{ 'agent-header--with-sidebar-edge': !sidebarCollapsed, 'agent-header--compact': compact, 'agent-header--collapsed': collapsible && collapsed }"
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
      v-if="agent && !(collapsible && collapsed)"
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
          v-if="agentLocationLabel"
          class="agent-header__folder"
          :title="agent.folder ?? undefined"
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
      v-else-if="!agent"
      class="agent-header__identity"
    >
      <strong>{{ $t('surface.agentHeader.noAgent') }}</strong>
    </div>

    <div v-if="collapsible && collapsed && agent" class="agent-header__collapsed-status">
      <span>{{ agentStatusDetail }}</span>
    </div>

    <div v-if="!(collapsible && collapsed)" class="agent-header__activity">
      <GitDiffControl
        v-if="gitReviewAvailable && agent && gitStatus"
        class="agent-header__git-status"
        :agent-id="agent.id"
        :git-status="gitStatus"
        :last-turn-git-diff="lastTurnGitDiff"
        :selected-target="agent.gitDiffTarget"
        @open="emit('open-git-diff', $event)"
        @select="emit('select-git-diff-target', $event)"
      />
      <GitWorkflowControl
        v-if="gitReviewAvailable && agent"
        ref="gitWorkflowControl"
        :agent="agent"
        :git-status="gitStatus"
        :get-workflow="getGitWorkflow"
        :generate-message="generateGitMessage"
        :commit-changes="commitGitChanges"
        :push-branch="pushGitBranch"
        :create-pull-request="createGitPullRequest"
        :merge-branch="mergeGitBranch"
        :update-from-base="updateGitBranchFromBase"
        :report-back-agent-name="reportBackAgentName"
      />
      <OpenInControl
        v-if="agent?.folder && openInAvailable && openInCatalog && openInCatalog.applications.length > 0"
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
        v-if="showWorkspaceToggle"
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
    <div v-if="collapsible && collapsed && gitReviewAvailable && gitStatus" class="agent-header__collapsed-stats" :aria-label="$t('surface.gitReviewPanel.diffStatistics')">
      <span class="agent-header__collapsed-added">+{{ gitStatus.addedLines }}</span>
      <span class="agent-header__collapsed-removed">-{{ gitStatus.removedLines }}</span>
    </div>
    <button
      v-if="collapsible"
      class="agent-header__collapse-toggle"
      type="button"
      :aria-label="collapsed ? $t('surface.agentHeader.expandAttachedHeader') : $t('surface.agentHeader.collapseAttachedHeader')"
      :title="collapsed ? $t('surface.agentHeader.expandAttachedHeader') : $t('surface.agentHeader.collapseAttachedHeader')"
      :aria-expanded="!collapsed"
      @click="emit('toggle-collapse')"
    >
      <IconChevronDown v-if="collapsed" aria-hidden="true" />
      <IconChevronUp v-else aria-hidden="true" />
    </button>
  </header>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { localizedText } from '../i18n/errors';
import { computed, ref } from 'vue';
import type { Agent, AgentGitDiffTarget, AgentGitStatus, AgentSubagentTree, BackendRuntimeStatus, DesktopUpdateStatus, OpenInApplication, OpenInApplicationCatalog, TurnGitDiff } from '@codex-claw/core/contracts';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import { ListIcon, PanelLeftOpenIcon } from '../shared/icons/app-icons';
import { IconChevronDown, IconChevronUp, IconLayoutSidebarRight } from '@tabler/icons-vue';
import AgentAvatar from './AgentAvatar.vue';
import UpdateAvailableBadge from './UpdateAvailableBadge.vue';
import OpenInControl from '../shared/OpenInControl.vue';
import SubagentControl from './SubagentControl.vue';
import GitWorkflowControl from './GitWorkflowControl.vue';
import GitDiffControl from './GitDiffControl.vue';
import { effectiveOpenInApplication } from '../shared/open-in';

const props = withDefaults(defineProps<{
  agent: Agent | null;
  repositoryIcon?: string;
  gitStatus?: AgentGitStatus | null;
  lastTurnGitDiff?: TurnGitDiff | null;
  backendRuntime: BackendRuntimeStatus;
  workspaceOpen?: boolean;
  isLoading: boolean;
  sidebarCollapsed: boolean;
  compact?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  showWorkspaceToggle?: boolean;
  updateStatus?: DesktopUpdateStatus;
  executionPlanAvailable?: boolean;
  executionPlanOpen?: boolean;
  openInAvailable?: boolean;
  openInCatalog?: OpenInApplicationCatalog;
  subagentTree?: AgentSubagentTree | null;
  selectedSubagentConversationId?: string | null;
  reportBackAgentName?: string | null;
  getGitWorkflow?: (agentId: string) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  generateGitMessage?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitMessageGenerationInput) => Promise<import('@codex-claw/core/contracts').AgentGitMessageGenerationResult>;
  commitGitChanges?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitCommitInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  pushGitBranch?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitPushInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  createGitPullRequest?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitPullRequestInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  mergeGitBranch?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitMergeInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  updateGitBranchFromBase?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitUpdateFromBaseInput) => Promise<import('@codex-claw/core/contracts').AgentGitUpdateFromBaseResult>;
}>(), { showWorkspaceToggle: true });

const emit = defineEmits<{
  'expand-sidebar': [];
  'toggle-workspace': [];
  'toggle-execution-plan': [];
  'open-git-diff': [target: AgentGitDiffTarget];
  'select-git-diff-target': [target: AgentGitDiffTarget];
  'install-update': [];
  'open-in': [application: OpenInApplication];
  'select-subagent': [conversationId: string];
  'toggle-collapse': [];
}>();

const gitWorkflowControl = ref<{
  showDebugOperationProgress(operation: 'pullRequest' | 'merge'): void | Promise<void>;
} | null>(null);

function showDebugGitOperationProgress(operation: 'pullRequest' | 'merge'): void | Promise<void> {
  return gitWorkflowControl.value?.showDebugOperationProgress(operation);
}

defineExpose({ showDebugGitOperationProgress });

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
  if (!agent) return '';

  const workspace = agent.workspace?.kind === 'git' ? agent.workspace : null;
  const availableGitStatus = gitStatus?.state !== 'unknown' ? gitStatus : null;
  const branch = availableGitStatus?.branch ?? workspace?.branch;
  if (!branch) return agent.folder ?? '';

  const repository = availableGitStatus?.repository ?? workspace?.repositoryName ?? availableGitStatus?.folder
    .replace(/[\\/]+$/u, '')
    .split(/[\\/]/u)
    .filter(Boolean)
    .at(-1);

  if (!repository) return agent.name?.trim() ? branch : '';
  return agent.name?.trim() ? `${branch} @ ${repository}` : `@ ${repository}`;
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
    case 'awaitingInput':
      return localizedText(props.agent.status.detail, translate) ?? translate('dynamic.misc.awaitingInput');
    case 'error':
      return localizedText(props.agent.status.message, translate);
    case 'idle':
      return translate('surface.agentHeader.readyToGetGoing');
  }
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

.agent-header--compact {
  gap: var(--space-4);
  padding-inline: var(--space-4);
  -webkit-app-region: no-drag;
}

.agent-header--collapsed {
  flex-basis: 40px;
  min-height: 40px;
}

.agent-header__collapsed-status {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  overflow: hidden;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.agent-header__collapsed-status span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-header__collapsed-stats {
  flex: 0 0 auto;
  display: flex;
  gap: var(--space-3);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.agent-header__collapsed-added {
  color: var(--color-success);
}

.agent-header__collapsed-removed {
  color: var(--color-error);
}

.agent-header__collapse-toggle {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.agent-header__collapse-toggle:hover {
  background: var(--color-surface-high);
  color: var(--color-text);
}

.agent-header__collapse-toggle svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.agent-header--compact .agent-header__identity {
  flex: 1 1 0;
}

.agent-header--compact .agent-header__activity {
  flex: 0 0 auto;
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
