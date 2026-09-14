<template>
  <AgentHeader
    v-if="!isAgentEmpty && currentAgent"
    ref="agentHeader"
    :agent="currentAgent"
    :repository-icon="repositoryIconForAgent(currentAgent, snapshot.general.repositoryIcons)"
    :git-status="currentAgentGitStatus"
    :last-turn-git-diff="lastTurnGitDiff"
    :backend-runtime="currentBackendRuntime"
    :workspace-open="rightWorkspaceVisible"
    :is-loading="isLoading"
    :sidebar-collapsed="agentSidebarCollapsed"
    :update-status="clawHostCapabilities.appUpdates ? updateStatus : undefined"
    :execution-plan-available="Boolean(currentTurnPlan)"
    :execution-plan-open="executionPlanVisible"
    :open-in-available="clawHostCapabilities.openInApplications && isLocalAgent(currentAgent)"
    :open-in-catalog="openInApplications"
    :subagent-tree="currentSubagentTree"
    :selected-subagent-conversation-id="selectedSubagentConversationIdFor(currentAgent.id)"
    :get-git-workflow="props.getAgentGitWorkflow"
    :generate-git-message="props.generateAgentGitMessage"
    :commit-git-changes="props.commitAgentGitChanges"
    :push-git-branch="props.pushAgentGitBranch"
    :create-git-pull-request="props.createAgentGitPullRequest"
    :merge-git-branch="props.mergeAgentGitBranch"
    :report-back-agent-name="reportBackAgentName"
    @expand-sidebar="emit('expand-sidebar')"
    @toggle-execution-plan="toggleExecutionPlan"
    @toggle-workspace="toggleRightWorkspace"
    @open-git-diff="openAgentGitDiffPreview(currentAgent.id, $event)"
    @open-in="openAgentIn(currentAgent.id, $event)"
    @select-subagent="openSubagent(currentAgent.id, $event)"
    @install-update="emit('install-update')"
  />
  <div ref="workspaceBody" class="app-shell__body">
    <AgentEmptyState v-if="isAgentEmpty" @start-work="handleStartWorkAction" />
    <ConversationPane
      v-else
      ref="conversationPane"
      :controller="conversationPaneController"
      :agent="currentAgent"
      :agents="snapshot.agents"
      :attachment-annotation-counts="activeAttachmentAnnotationCounts"
      :plan="currentTurnPlan"
      :plan-visible="executionPlanVisible"
      :history-load-failed="historyLoadFailed"
      :history-loading="isConversationLoading"
      :has-visible-messages="hasVisibleMessages"
      @annotate-attachment="openAttachmentImageAnnotation"
      @close-plan="closeExecutionPlan"
      @retry-history="retryConversationHistory"
    />
    <RightWorkspacePanel
      v-for="agent in snapshot.agents"
      :key="agent.id"
      v-show="isRightWorkspaceVisible(agent.id)"
      class="app-shell__right-workspace"
      :style="{ flexBasis: `${rightWorkspaceFor(agent.id).width}px` }"
      :active-tab="rightWorkspaceFor(agent.id).activeTab"
      :agent="agent"
      :agents="snapshot.agents"
      :files="agent.id === currentAgent?.id ? agentFiles : []"
      :files-pane-open="rightWorkspaceFor(agent.id).filesPaneOpen"
      :files-pane-width="rightWorkspaceFor(agent.id).filesPaneWidth"
      :git-panel="effectiveGitReviewPanelFor(agent)"
      :git-status="snapshot.agentGitStatuses[agent.id] ?? null"
      :plan-panel="rightWorkspaceFor(agent.id).planPanel"
      :plan-updating="isPlanPreviewUpdatingFor(agent.id)"
      :file-panels="rightWorkspaceFor(agent.id).filePanels"
      :image-panels="rightWorkspaceFor(agent.id).imagePanels"
      :diff-panels="rightWorkspaceFor(agent.id).diffPanels"
      :tabs="rightWorkspaceFor(agent.id).tabs"
      :visible="isRightWorkspaceVisible(agent.id) && !isModalDialogVisible"
      :browser-id="rightWorkspaceFor(agent.id).browserId"
      :browser-initial-url="rightWorkspaceFor(agent.id).browserInitialUrl"
      :browser-open-request-id="rightWorkspaceFor(agent.id).browserOpenRequestId"
      :browser-visualization="rightWorkspaceFor(agent.id).browserVisualization"
      :browser-available="clawHostCapabilities.embeddedBrowser"
      :open-in-available="clawHostCapabilities.openInApplications && isLocalAgent(agent)"
      :open-in-catalog="openInApplications"
      :subagent-tree="subagentTreeFor(agent.id)"
      :load-subagent-messages="(conversationId) => loadSubagentMessages(agent.id, conversationId)"
      :backlog-items="rightWorkspaceFor(agent.id).backlogItems"
      :backlog-status="rightWorkspaceFor(agent.id).backlogStatus"
      :backlog-error="rightWorkspaceFor(agent.id).backlogError"
      :github-repository="snapshot.agentGitStatuses[agent.id]?.githubRepository ?? null"
      :github-connection="
        snapshot.workBacklog.connections.find((connection) => connection.provider === 'github') ?? null
      "
      :work-assignments="snapshot.workBacklog.assignments"
      :prefill-repository-work="(item) => prefillRepositoryWork(agent.id, item)"
      :clear-repository-work-assignment="(item) => $emit('remove-work-item-assignment', item)"
      :close-repository-work-agent="(agentId) => $emit('close-agent', agentId)"
      :start-repository-work="(input) => startRepositoryWork(agent.id, input)"
      :show-repository-work-agent="selectAgentFromShell"
      @close-tab="closeRightWorkspaceTab(agent.id, $event)"
      @cancel-plan="cancelPlanReview(agent.id)"
      @comment-plan="commentOnPlan"
      @confirm-plan="confirmPlan"
      @open-tab="openRightWorkspaceTabFromMenu(agent.id, $event)"
      @open-in="openAgentIn(agent.id, $event.application, $event.filePath)"
      @preview-file="openFilePreviewForAgent(agent.id, $event)"
      @toggle-files-pane="toggleFileExplorer(agent.id)"
      @resize-files-pane="rightWorkspaceFor(agent.id).filesPaneWidth = $event"
      @open-link="openConversationLink"
      @refresh-git-diff="openAgentGitDiffPreview(agent.id, $event)"
      @refresh-backlog="loadRepositoryBacklog(agent.id)"
      @select-tab="selectRightWorkspaceTab(agent.id, $event)"
      @send-prompt="forwardPrompt"
    />
    <div
      v-if="rightWorkspaceVisible"
      class="app-shell__right-workspace-resizer"
      :aria-label="$t('surface.appShell.resizeRightWorkspace')"
      @pointerdown="startRightWorkspaceResize"
    />
  </div>
</template>

<script setup lang="ts">
import type {
  Agent,
  AgentFileSearchItem,
  AgentGitCommitInput,
  AgentGitDiffTarget,
  AgentGitMergeInput,
  AgentGitMessageGenerationInput,
  AgentGitMessageGenerationResult,
  AgentGitPullRequestInput,
  AgentGitPushInput,
  AgentGitStatus,
  AgentGitWorkflow,
  AgentSubagentTree,
  AppSnapshot,
  AutomationLocation,
  BackendConversationRef,
  BackendRuntimeStatus,
  ConversationFileLink,
  DesktopUpdateStatus,
  OpenInApplication,
  OpenInApplicationCatalog,
  RendererMessage,
  RendererSendPromptOptions,
  ThreadPlan,
  WorkItem,
  WorkItemQuery,
  WorkProviderKind,
} from '@codex-claw/core/contracts';
import { PRIMARY_BROWSER_ID, type AppCommand } from '@codex-claw/core/contracts';
import type {
  CodexConversationLink,
  CodexConversationPaneController,
  CodexConversationVisualization,
  CodexMessageImage,
  CodexMessageImageContext,
  CodexNativeAttachment,
} from '@codex-app-sdk/vue';
import { computed, reactive, ref, toRefs, watch } from 'vue';
import { repositoryIconForAgent } from '@codex-claw/core/workspace-sidebar';
import { agentDisplayName } from '@codex-claw/core/agent-display';
import { translate } from '../i18n';
import { clawHostCapabilities } from '../platform-api';
import AgentEmptyState from './AgentEmptyState.vue';
import AgentHeader from './AgentHeader.vue';
import ConversationPane from './ConversationPane.vue';
import RightWorkspacePanel from './RightWorkspacePanel.vue';
import type { AgentRightWorkspaceState } from './use-right-workspace-state';
import type { PlanReviewComment, SidePanelGitDiffState } from './side-panel';
import { fileBasename } from './use-workspace-previews';
import {
  isRightWorkspaceSubagentTab,
  rightWorkspaceSubagentConversationId,
  rightWorkspaceSubagentTab,
  rightWorkspaceImageTab,
  type RepositoryWorkStartInput,
  type RightWorkspaceTab,
} from './right-workspace';

const props = defineProps<{
  activeAttachmentAnnotationCounts: Readonly<Record<string, number>>;
  agentFiles: AgentFileSearchItem[];
  agentSidebarCollapsed: boolean;
  closeRightWorkspaceTab: (agentId: string, tab: RightWorkspaceTab) => void;
  confirmPlan: () => void;
  conversationPaneController: CodexConversationPaneController;
  conversationPlan: ThreadPlan | null;
  currentAgent: Agent | null;
  currentAgentGitStatus: AgentGitStatus | null;
  currentBackendRuntime: BackendRuntimeStatus;
  forwardPrompt: (prompt: string, options?: RendererSendPromptOptions) => void;
  generateAgentGitMessage: (
    agentId: string,
    input: AgentGitMessageGenerationInput,
  ) => Promise<AgentGitMessageGenerationResult>;
  getAgentGitWorkflow: (agentId: string) => Promise<AgentGitWorkflow>;
  handleStartWorkAction: (action: 'new' | 'github' | 'local' | 'url') => void;
  isAgentEmpty: boolean;
  isConversationLoading: boolean;
  historyLoadFailed: boolean;
  isLoading: boolean;
  isModalDialogVisible: boolean;
  isRightWorkspaceVisible: (agentId: string) => boolean;
  loadWorkItems: (
    provider: WorkProviderKind,
    repositoryId: string,
    location?: AutomationLocation,
    query?: WorkItemQuery,
  ) => Promise<WorkItem[] | void>;
  hasVisibleMessages: boolean;
  hasRunningPlanTool: boolean;
  latestConversationTurnId: string | null;
  mergeAgentGitBranch: (agentId: string, input: AgentGitMergeInput) => Promise<AgentGitWorkflow>;
  openAgentGitDiffPreview: (agentId?: string, target?: AgentGitDiffTarget) => Promise<void>;
  openAgentIn: (agentId: string, application: OpenInApplication, filePath?: string) => Promise<void>;
  openAttachmentImageAnnotation: (attachment: CodexNativeAttachment) => void;
  openFilePreview: (link: ConversationFileLink) => Promise<void>;
  openFilePreviewForAgent: (agentId: string, filePath: string) => Promise<void>;
  openInApplications: OpenInApplicationCatalog;
  openRightWorkspaceTab: (tab: RightWorkspaceTab, agentId?: string) => void;
  prefillWorkItemForAgent: (agentId: string, item: WorkItem) => void;
  pushAgentGitBranch: (agentId: string, input: AgentGitPushInput) => Promise<AgentGitWorkflow>;
  rightWorkspaceFor: (agentId: string) => AgentRightWorkspaceState;
  rightWorkspaces: Record<string, AgentRightWorkspaceState>;
  rightWorkspaceVisible: boolean;
  readConversationMessages: (
    ref: BackendConversationRef,
    agentId: string,
    location?: AutomationLocation,
  ) => Promise<RendererMessage[]>;
  retryConversationHistory: () => Promise<void>;
  selectAgentFromShell: (agentId: string) => void;
  selectRightWorkspaceTab: (agentId: string, tab: RightWorkspaceTab) => void;
  snapshot: AppSnapshot;
  startRepositoryWork: (agentId: string, input: RepositoryWorkStartInput) => Promise<void>;
  startRightWorkspaceResize: (event: PointerEvent) => void;
  toggleFileExplorer: (agentId: string) => void;
  toggleRightWorkspace: () => void;
  updateStatus?: DesktopUpdateStatus;
  commitAgentGitChanges: (agentId: string, input: AgentGitCommitInput) => Promise<AgentGitWorkflow>;
  createAgentGitPullRequest: (agentId: string, input: AgentGitPullRequestInput) => Promise<AgentGitWorkflow>;
}>();

const agentHeader = ref<{
  showDebugGitOperationProgress(operation: 'pullRequest' | 'merge'): void | Promise<void>;
} | null>(null);

const emit = defineEmits<{
  'close-agent': [agentId: string];
  'expand-sidebar': [];
  'install-update': [];
  'remove-work-item-assignment': [item: WorkItem];
  sendPrompt: [prompt: string];
  'update:planMode': [enabled: boolean];
}>();

const reportBackAgentName = computed(() => {
  const delegatedByAgentId = props.currentAgent?.delegatedByAgentId;
  if (!delegatedByAgentId) return null;
  const recipient = props.snapshot.agents.find((agent) => agent.id === delegatedByAgentId);
  return recipient ? agentDisplayName(recipient) : null;
});

const {
  activeAttachmentAnnotationCounts,
  agentFiles,
  agentSidebarCollapsed,
  closeRightWorkspaceTab,
  confirmPlan,
  conversationPaneController,
  currentAgent,
  currentAgentGitStatus,
  currentBackendRuntime,
  forwardPrompt,
  handleStartWorkAction,
  isAgentEmpty,
  isConversationLoading,
  historyLoadFailed,
  isLoading,
  isModalDialogVisible,
  isRightWorkspaceVisible,
  openAgentIn,
  openAttachmentImageAnnotation,
  openFilePreviewForAgent,
  openInApplications,
  rightWorkspaceVisible,
  retryConversationHistory,
  selectAgentFromShell,
  selectRightWorkspaceTab,
  snapshot,
  startRepositoryWork,
  startRightWorkspaceResize,
  toggleFileExplorer,
  toggleRightWorkspace,
  updateStatus,
} = toRefs(props);

const workspaceBody = ref<HTMLElement | null>(null);
const conversationPane = ref<{ focusComposer(): void } | null>(null);
const rightWorkspaces = props.rightWorkspaces;
const executionPlanStates = reactive<Record<string, { open: boolean; turnId: string }>>({});

const currentTurnPlan = computed<ThreadPlan | null>(() => {
  const plan = props.conversationPlan;
  if (!plan?.steps.length) {
    return null;
  }
  if (props.isConversationLoading && !props.hasVisibleMessages) {
    return null;
  }
  const latestTurnId = props.latestConversationTurnId;
  return !latestTurnId || latestTurnId === plan.turnId ? plan : null;
});
const executionPlanVisible = computed(() => {
  const agentId = currentAgent.value?.id;
  const plan = currentTurnPlan.value;
  if (!agentId || !plan) {
    return false;
  }

  return executionPlanStates[agentId]?.turnId === plan.turnId ? executionPlanStates[agentId].open : true;
});

watch(
  () => ({
    agentId: currentAgent.value?.id ?? null,
    turnId: currentTurnPlan.value?.turnId ?? null,
  }),
  ({ agentId, turnId }) => {
    if (!agentId || !turnId) {
      return;
    }

    const existing = executionPlanStates[agentId];
    if (!existing || existing.turnId !== turnId) {
      executionPlanStates[agentId] = { open: true, turnId };
    }
  },
  { immediate: true },
);

function toggleExecutionPlan(): void {
  const agentId = currentAgent.value?.id;
  const plan = currentTurnPlan.value;
  if (!agentId || !plan) {
    return;
  }

  const existing = executionPlanStates[agentId];
  executionPlanStates[agentId] = {
    turnId: plan.turnId,
    open: existing?.turnId === plan.turnId ? !existing.open : false,
  };
}

function closeExecutionPlan(): void {
  const agentId = currentAgent.value?.id;
  const plan = currentTurnPlan.value;
  if (!agentId || !plan) {
    return;
  }

  executionPlanStates[agentId] = { turnId: plan.turnId, open: false };
}

function cancelPlanReview(agentId: string): void {
  emit('update:planMode', false);
  closeRightWorkspaceTab.value(agentId, 'plan');
}

function commentOnPlan(comments: PlanReviewComment[]): void {
  if (comments.length === 0) {
    return;
  }

  emit('sendPrompt', formatPlanCommentPrompt(comments));
}

function formatPlanCommentPrompt(comments: PlanReviewComment[]): string {
  const formattedComments = comments
    .map((comment, index) => [`${index + 1}. On: "${comment.quote}"`, `   Comment: ${comment.body}`].join('\n'))
    .join('\n\n');

  return ['Refine the plan using these comments:', '', formattedComments].join('\n');
}

function rightWorkspaceFor(agentId: string): AgentRightWorkspaceState {
  return props.rightWorkspaceFor(agentId);
}

const lastTurnGitDiff = computed(() => {
  const turnId = props.latestConversationTurnId;
  const diff = turnId ? props.snapshot.turnGitDiffs[turnId] : null;
  if (!diff || diff.agentId !== props.currentAgent?.id || !diff.diff) return null;
  return diff;
});

function openAgentGitDiffPreview(agentId?: string, target?: AgentGitDiffTarget): Promise<void> {
  return props.openAgentGitDiffPreview(agentId, target);
}

function openRightWorkspaceTab(tab: RightWorkspaceTab, agentId?: string): void {
  props.openRightWorkspaceTab(tab, agentId);
}

function readConversationMessages(ref: BackendConversationRef, agentId: string): Promise<RendererMessage[]> {
  return props.readConversationMessages(ref, agentId);
}

function openFilePreview(link: ConversationFileLink): Promise<void> {
  return props.openFilePreview(link);
}

function openRequestedBrowser(agentId: string, command: Extract<AppCommand, { type: 'open-browser' }>): void {
  const workspace = rightWorkspaceFor(agentId);
  workspace.browserId = command.browserId ?? PRIMARY_BROWSER_ID;
  workspace.browserInitialUrl = command.url ?? '';
  workspace.browserVisualization = null;
  workspace.browserOpenRequestId += 1;
  openRightWorkspaceTab('browser', agentId);
}

function openConversationVisualization(visualization: CodexConversationVisualization): void {
  const agent = currentAgent.value;
  if (!agent || !clawHostCapabilities.embeddedBrowser) return;
  const workspace = rightWorkspaceFor(agent.id);
  workspace.browserId = PRIMARY_BROWSER_ID;
  workspace.browserInitialUrl = '';
  workspace.browserVisualization = { ...visualization };
  workspace.browserOpenRequestId += 1;
  openRightWorkspaceTab('browser', agent.id);
}

function handleBrowserOpenCommand(command: Extract<AppCommand, { type: 'open-browser' }>): void {
  const agentId = command.agentId ?? currentAgent.value?.id;
  if (!agentId || !props.snapshot.agents.some((agent) => agent.id === agentId)) return;
  openRequestedBrowser(agentId, command);
}

function openConversationImage(image: CodexMessageImage, context?: CodexMessageImageContext): boolean {
  if (context?.intent === 'fullscreen') return false;

  const agent = currentAgent.value;
  if (!agent) return false;

  const durablePath = image.path?.trim() || undefined;
  const messageIdentifier = context?.message?.id ?? `message-${context?.index ?? 'unknown'}`;
  const tab = rightWorkspaceImageTab([messageIdentifier, image.kind, durablePath ?? image.src].join('\0'));
  const title =
    image.title?.trim() ||
    image.name?.trim() ||
    (durablePath ? fileBasename(durablePath) : '') ||
    image.alt.trim() ||
    'Image';
  const workspace = rightWorkspaceFor(agent.id);
  workspace.imagePanels = {
    ...workspace.imagePanels,
    [tab]: {
      kind: 'image',
      title,
      ...(durablePath ? { subtitle: durablePath, path: durablePath } : {}),
      ...(image.mimeType ? { mimeType: image.mimeType } : {}),
      alt: image.alt || title,
      src: image.src,
      state: 'idle',
      error: null,
    },
  };
  openRightWorkspaceTab(tab, agent.id);
  return true;
}

function openConversationLink(link: CodexConversationLink): void | Promise<void> {
  if (link.kind === 'external') {
    window.open(link.href, '_blank', 'noopener,noreferrer');
    return;
  }
  const context = link as CodexConversationLink &
    Partial<Pick<ConversationFileLink, 'turnId' | 'messageId' | 'itemId'>>;
  return openFilePreview({
    kind: 'file',
    href: link.href,
    path: link.path,
    ...(link.filepath ? { filepath: link.filepath } : {}),
    ...(link.action ? { action: link.action } : {}),
    ...(link.line === undefined ? {} : { line: link.line }),
    ...(link.column === undefined ? {} : { column: link.column }),
    ...(context.turnId ? { turnId: context.turnId } : {}),
    ...(context.messageId ? { messageId: context.messageId } : {}),
    ...(context.itemId ? { itemId: context.itemId } : {}),
  });
}

function prefillWorkItemForAgent(agentId: string, item: WorkItem): void {
  props.prefillWorkItemForAgent(agentId, item);
}

function isPlanPreviewUpdatingFor(agentId: string): boolean {
  const panel = rightWorkspaceFor(agentId).planPanel;
  if (!panel || panel.purpose !== 'plan') return false;
  return agentId === currentAgent.value?.id && props.hasRunningPlanTool;
}

function effectiveGitReviewPanelFor(agent: Agent): SidePanelGitDiffState {
  return (
    rightWorkspaceFor(agent.id).gitReviewPanel ?? {
      kind: 'gitDiff',
      title: translate('surface.appShell.review'),
      ...(agent.folder ? { subtitle: agent.folder } : {}),
      diff: '',
      state: 'loading',
      error: null,
    }
  );
}

function subagentTreeFor(agentId: string): AgentSubagentTree | null {
  const agent = props.snapshot.agents.find((candidate) => candidate.id === agentId);
  const tree = props.snapshot.subagentTrees[agentId];
  return agent?.backendSession?.kind === 'codex' && tree?.rootConversationId === agent.backendSession.threadId
    ? tree
    : null;
}

const currentSubagentTree = computed<AgentSubagentTree | null>(() => {
  const agentId = currentAgent.value?.id;
  return agentId ? subagentTreeFor(agentId) : null;
});
watch(
  () =>
    props.snapshot.agents.map(
      (agent) =>
        `${agent.id}:${agent.backendSession?.kind === 'codex' ? agent.backendSession.threadId : ''}:${props.snapshot.subagentTrees[agent.id]?.rootConversationId ?? ''}:${Object.keys(
          props.snapshot.subagentTrees[agent.id]?.nodes ?? {},
        )
          .sort()
          .join(',')}`,
    ),
  () => {
    for (const [agentId, workspace] of Object.entries(rightWorkspaces)) {
      for (const tab of workspace.tabs.filter(isRightWorkspaceSubagentTab)) {
        const conversationId = rightWorkspaceSubagentConversationId(tab);
        if (!subagentTreeFor(agentId)?.nodes[conversationId]) {
          closeRightWorkspaceTab.value(agentId, tab);
        }
      }
    }
  },
);

function openSubagent(agentId: string, conversationId: string): void {
  const tree = subagentTreeFor(agentId);
  if (!tree?.nodes[conversationId]) return;
  openRightWorkspaceTab(rightWorkspaceSubagentTab(conversationId), agentId);
}

function selectedSubagentConversationIdFor(agentId: string): string | null {
  const tab = rightWorkspaceFor(agentId).activeTab;
  return tab && isRightWorkspaceSubagentTab(tab) ? rightWorkspaceSubagentConversationId(tab) : null;
}

function loadSubagentMessages(agentId: string, conversationId: string): Promise<RendererMessage[]> {
  const tree = subagentTreeFor(agentId);
  if (!tree?.nodes[conversationId])
    return Promise.reject(new Error(translate('surface.appShell.subagentConversationIsUnavailable')));
  return readConversationMessages({ backend: 'codex', threadId: conversationId }, agentId);
}

function openRightWorkspaceTabFromMenu(agentId: string, tab: RightWorkspaceTab): void {
  if (tab === 'backlog') {
    void openRepositoryBacklog(agentId);
    return;
  }
  if (tab === 'review') {
    void openAgentGitDiffPreview(agentId);
    return;
  }
  if (tab === 'files') {
    rightWorkspaceFor(agentId).filesPaneOpen = true;
  }
  openRightWorkspaceTab(tab, agentId);
}

async function openRepositoryBacklog(agentId: string): Promise<void> {
  openRightWorkspaceTab('backlog', agentId);
  const workspace = rightWorkspaceFor(agentId);
  if (workspace.backlogStatus === 'notLoaded' || workspace.backlogStatus === 'error') {
    await loadRepositoryBacklog(agentId);
  }
}

async function loadRepositoryBacklog(agentId: string): Promise<void> {
  const workspace = rightWorkspaceFor(agentId);
  const repositoryId = props.snapshot.agentGitStatuses[agentId]?.githubRepository?.trim();
  if (!repositoryId) {
    workspace.backlogStatus = 'error';
    workspace.backlogError = translate('dynamic.misc.repositoryNotConnected');
    return;
  }

  workspace.backlogStatus = 'loading';
  workspace.backlogError = null;
  try {
    workspace.backlogItems =
      (await props.loadWorkItems('github', repositoryId, undefined, {
        kind: 'all',
        state: 'all',
      })) ?? [];
    workspace.backlogStatus = 'loaded';
  } catch (error) {
    workspace.backlogStatus = 'error';
    workspace.backlogError = error instanceof Error ? error.message : String(error);
  }
}

function prefillRepositoryWork(agentId: string, item: WorkItem): void {
  prefillWorkItemForAgent(agentId, item);
}

function isLocalAgent(agent: Agent): boolean {
  const team = props.snapshot.teams.find((candidate) => candidate.id === agent.teamId);
  return !team?.remoteConnectionId;
}

function focusComposer(): void {
  conversationPane.value?.focusComposer();
}

function workspaceBodyElement(): HTMLElement | null {
  return workspaceBody.value;
}

function showDebugGitOperationProgress(operation: 'pullRequest' | 'merge'): void | Promise<void> {
  return agentHeader.value?.showDebugGitOperationProgress(operation);
}

defineExpose({
  focusComposer,
  handleBrowserOpenCommand,
  openConversationLink,
  openConversationImage,
  openConversationVisualization,
  showDebugGitOperationProgress,
  workspaceBodyElement,
});
</script>

<style scoped>
.app-shell__body {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  display: flex;
  box-shadow: var(--shadow-content-edge);
}

.app-shell__right-workspace {
  flex: 0 0 420px;
}

.app-shell__right-workspace-resizer {
  position: relative;
  flex: 0 0 5px;
  order: 1;
  cursor: col-resize;
  touch-action: none;
  z-index: 1;
}

.app-shell__right-workspace-resizer::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 2px;
  width: 1px;
  background: var(--color-border);
}

.app-shell__right-workspace-resizer:hover::after {
  background: var(--color-border-strong);
}
</style>
