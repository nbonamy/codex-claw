<template>
  <main
    class="app-shell"
    :class="{ 'app-shell--auth-gated': showLoginLanding }"
  >
    <CodexLoginLanding
      v-if="showLoginLanding"
      :loading="authenticationLoading || authentication?.login.status === 'pending'"
      :cancellable="authentication?.login.status === 'pending'"
      :cancelling="authenticationCancelling"
      :error="authenticationError ?? authentication?.login.error"
      @cancel="cancelChatGptLogin"
      @login="startChatGptLogin"
    />
    <TeamRail
      :teams="snapshot.teams"
      :unread-team-ids="unreadTeamIds"
      :active-team-id="cockpitVisible || loopsVisible || settingsVisible ? null : activeTeam?.id ?? null"
      :cockpit-active="cockpitVisible"
      :loops-active="loopsVisible"
      :settings-active="settingsVisible"
      :agent-sidebar-expanded="showAgentSidebar"
      :rate-limits="snapshot.accountRateLimits"
      :account="authentication?.account ?? null"
      class="app-shell__team-rail"
      @close-team="$emit('close-team', $event)"
      @disconnect-team="$emit('disconnect-team', $event)"
      @edit-team="openEditTeam"
      @new-team="openNewTeam"
      @open-settings="openSettings"
      @open-whats-new="openWhatsNew"
      @logout="logoutCodex"
      @quit="quit"
      @reorder-teams="$emit('reorder-teams', $event)"
      @select-cockpit="openCockpit"
      @select-loops="openLoops"
      @select-team="selectTeamFromRail"
    />
    <Transition name="agent-sidebar">
      <AgentSidebar
        v-if="showAgentSidebar"
        :agents="activeTeamAgents"
        :forkable-agent-ids="forkableAgentIds"
        :active-agent-id="currentAgent?.id ?? null"
        :unread-agent-ids="unreadAgentIds"
        :bench="activeBench"
        :teams="snapshot.teams"
        :team-id="activeTeam?.id ?? null"
        :team-name="activeTeamName"
        :compact="agentListCompact"
        :width="agentSidebarWidth"
        :min-width="agentSidebarMinWidth"
        :max-width="agentSidebarMaxWidth"
        :list-conversations="listAgentConversations"
        :open-in-catalog="openInApplications"
        :quick-switch-shortcuts-visible="quickAgentShortcutsVisible"
        :resume-conversation="resumeAgentConversation"
        @collapse-sidebar="agentSidebarCollapsed = true"
        @close-agent="$emit('close-agent', $event)"
        @deploy-bench-template="deployBenchTemplateForActiveTeam"
        @duplicate-agent="$emit('duplicate-agent', $event)"
        @fork-agent="$emit('fork-agent', $event)"
        @edit-agent="openEditAgent"
        @move-agent-to-team="$emit('move-agent-to-team', $event)"
        @open-in="openAgentIn($event.agentId, $event.application)"
        @new-agent="openNewAgent"
        @reorder-agents="$emit('reorder-agents', $event)"
        @restart-agent="$emit('restart-agent', $event)"
        @resize-sidebar="setAgentSidebarWidth"
        @remove-bench-template="removeBenchTemplateForActiveTeam"
        @save-agent-to-bench="$emit('save-agent-to-bench', $event)"
        @select-agent="selectAgentFromShell"
      />
    </Transition>
    <section class="app-shell__content">
      <div
        v-if="connectionState.status !== 'connected'"
        class="app-shell__connection-status"
        :class="`app-shell__connection-status--${connectionState.status}`"
        role="status"
        aria-live="polite"
      >
        <span class="app-shell__connection-status-dot" aria-hidden="true" />
        <span>{{ connectionStatusLabel }}</span>
        <span v-if="connectionState.detail" class="app-shell__connection-status-detail">
          {{ connectionState.detail }}
        </span>
      </div>
      <SettingsView
        v-if="settingsVisible"
        :active-tab="settingsActiveTab"
        :general-settings="snapshot.general"
        :settings="snapshot.theme"
        :source-folder="snapshot.sourceFolder"
        :work-backlog-connections="snapshot.workBacklog.connections"
        :work-backlog-error="workBacklogError"
        :work-backlog-status="workBacklogStatus"
        :work-provider-settings="snapshot.workBacklog.providerSettings"
        :work-provider-authorization="workProviderAuthorization"
        :remote-connections="snapshot.remoteConnections.connections"
        :teams="snapshot.teams"
        :list-source-folders="listSourceFolders"
        :list-ssh-hosts="listSshHosts"
        :add-ssh-connection="addSshConnection"
        :check-remote-connection="checkRemoteConnection"
        :update-remote-connection="updateRemoteConnection"
        :remove-remote-connection="removeRemoteConnection"
        :get-device-pairing-status="getDevicePairingStatus"
        :enable-device-pairing="enableDevicePairing"
        :disable-device-pairing="disableDevicePairing"
        :start-device-pairing="startDevicePairing"
        :check-device-pairing="checkDevicePairing"
        :list-paired-devices="listPairedDevices"
        :revoke-paired-device="revokePairedDevice"
        :daemon-status="daemonStatus"
        :daemon-status-error="daemonStatusError"
        :choose-codex-binary="chooseCodexBinary"
        :choose-source-folder="chooseSourceFolder"
        :connect-work-provider="connectWorkProvider"
        :open-work-provider-authorization="openWorkProviderAuthorization"
        :complete-work-provider-connection="completeWorkProviderConnection"
        :disconnect-work-provider="disconnectWorkProvider"
        :update-settings="updateSettings"
        :set-codex-resource-sharing="setCodexResourceSharing"
        :codex-resource-sharing-blocked="codexResourceSharingBlocked"
        :get-plugin-status="getPluginStatus"
        :set-daemon-enabled="setDaemonEnabled"
        :restart-app="restartApp"
        @select-tab="settingsActiveTab = $event"
      />
      <LoopsView
        v-else-if="loopsVisible"
        :backend-models="backendModels"
        :bench="snapshot.bench"
        :choose-agent-folder="chooseAgentFolder"
        :clear-loop-history="clearLoopHistory"
        :create-loop="createLoop"
        :delete-loop-execution="deleteLoopExecution"
        :delete-loop="deleteLoop"
        :get-loop-snapshot="getLoopSnapshot"
        :load-work-items="loadWorkItems"
        :load-work-repositories="loadWorkRepositories"
        :list-source-folders="listSourceFolders"
        :list-source-repositories="listSourceRepositories"
        :loops="snapshot.loops"
        :messages="snapshot.messages"
        :read-conversation-messages="readConversationMessages"
        :remote-connections="snapshot.remoteConnections.connections"
        :run-loop="runLoop"
        :source-repositories="sourceRepositories"
        :teams="snapshot.teams"
        :update-loop="updateLoop"
        :work-backlog="snapshot.workBacklog"
        :work-backlog-error="workBacklogError"
        :work-backlog-status="workBacklogStatus"
        :work-items-by-repository="workItemsByRepository"
        :work-repositories-by-provider="workRepositoriesByProvider"
      />
      <CockpitView
        v-else-if="cockpitVisible"
        :agents="snapshot.agents"
        :forkable-agent-ids="forkableAgentIds"
        :bench-by-team-id="benchByTeamId"
        :teams="snapshot.teams"
        :work-backlog="cockpitWorkBacklog"
        @add-agent="openNewAgent"
        @assign-work-item-to-bench-agent="openBenchAgentAssignmentDialog"
        @assign-work-item-to-new-agent="openNewAgentForWorkItem"
        @assign-work-item="assignExistingAgentWorkItem"
        @close-agent="$emit('close-agent', $event)"
        @deploy-bench-template="$emit('deploy-bench-template', $event)"
        @duplicate-agent="$emit('duplicate-agent', $event)"
        @fork-agent="$emit('fork-agent', $event)"
        @edit-agent="openEditAgent"
        @move-agent-to-team="$emit('move-agent-to-team', $event)"
        @prompt-agent="$emit('send-agent-prompt', $event)"
        @remove-bench-template="$emit('remove-bench-template', $event)"
        @remove-work-item-assignment="$emit('remove-work-item-assignment', $event)"
        @refresh-work-items="refreshWorkItems"
        @restart-agent="$emit('restart-agent', $event)"
        @save-agent-to-bench="$emit('save-agent-to-bench', $event)"
        @select-work-tag="selectWorkTagForCockpit"
        @select-work-assignee="selectWorkAssigneeForCockpit"
        @select-work-repository="selectWorkRepositoryForCockpit"
        @select-agent="selectAgentFromCockpit"
        @select-team="selectTeamFromRail"
      />
      <template v-else>
        <AgentHeader
          v-if="!isAgentEmpty && currentAgent"
          :agent="currentAgent"
          :git-status="currentAgentGitStatus"
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
          :github-backlog-available="Boolean(currentAgentGitStatus?.githubRepository)"
          :get-git-workflow="props.getAgentGitWorkflow"
          :generate-git-message="props.generateAgentGitMessage"
          :commit-git-changes="props.commitAgentGitChanges"
          :push-git-branch="props.pushAgentGitBranch"
          :create-git-branch="props.createAgentGitBranch"
          :create-git-pull-request="props.createAgentGitPullRequest"
          :merge-git-branch="props.mergeAgentGitBranch"
          @expand-sidebar="agentSidebarCollapsed = false"
          @toggle-execution-plan="toggleExecutionPlan"
          @toggle-workspace="toggleRightWorkspace"
          @open-git-diff="openAgentGitDiffPreview"
          @open-backlog="openRepositoryBacklog(currentAgent.id)"
          @open-in="openAgentIn(currentAgent.id, $event)"
          @select-subagent="openSubagent(currentAgent.id, $event)"
          @install-update="emit('install-update')"
        />
        <div ref="workspaceBody" class="app-shell__body">
          <AgentEmptyState
            v-if="isAgentEmpty"
            :bench="activeBench"
            @deploy-bench-template="deployBenchTemplateForActiveTeam"
            @new-agent="openNewAgent"
            @remove-bench-template="removeBenchTemplateForActiveTeam"
          />
          <ConversationPane
            v-else
            ref="conversationPane"
            :controller="conversationPaneController"
            :agent="currentAgent"
            :agents="snapshot.agents"
            :attachment-annotation-counts="activeAttachmentAnnotationCounts"
            :plan="currentTurnPlan"
            :plan-visible="executionPlanVisible"
            @annotate-attachment="openAttachmentImageAnnotation"
            @close-plan="closeExecutionPlan"
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
            :github-connection="snapshot.workBacklog.connections.find((connection) => connection.provider === 'github') ?? null"
            :work-assignments="snapshot.workBacklog.assignments"
            :prefill-repository-work="(item) => prefillRepositoryWork(agent.id, item)"
            :clear-repository-work-assignment="(item) => $emit('remove-work-item-assignment', item)"
            :close-repository-work-agent="(agentId) => $emit('close-agent', agentId)"
            :start-repository-work="(input) => startRepositoryWork(agent.id, input)"
            :show-repository-work-agent="selectAgentFromShell"
            :create-repository-issue="(description) => createRepositoryIssue(agent.id, description)"
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
            @refresh-git-diff="openAgentGitDiffPreview(agent.id)"
            @refresh-backlog="loadRepositoryBacklog(agent.id)"
            @select-tab="selectRightWorkspaceTab(agent.id, $event)"
            @send-prompt="forwardPrompt"
          />
          <div
            v-if="rightWorkspaceVisible"
            class="app-shell__right-workspace-resizer"
            aria-label="Resize right workspace"
            @pointerdown="startRightWorkspaceResize"
          />
        </div>
      </template>
    </section>
    <AgentDialog
      :visible="agentDialogVisible"
      :mode="agentDialogMode"
      :agent="editingAgent"
      :claude-code-enabled="snapshot.general.claudeCodeEnabled"
      :choose-agent-folder="chooseAgentFolder"
      :choose-source-worktree-destination="chooseSourceWorktreeDestination"
      :create-agent="createAgentFromDialog"
      :create-source-worktree="createSourceWorktree"
      :list-source-folders="listSourceFolders"
      :list-source-worktrees="listSourceWorktrees"
      :suggest-source-worktree-path="suggestSourceWorktreePath"
      :initial-new-team-name="pendingNewAgentTeamName"
      :initial-team-id="agentDialogTeamId"
      :remote-connection-id="agentDialogRemoteConnectionId"
      :source-folder-path="snapshot.sourceFolder.path"
      :source-recent-repo-names="snapshot.sourceFolder.recentRepoNames"
      :source-repositories="sourceRepositories"
      :list-source-repositories="listSourceRepositories"
      :update-agent="updateAgent"
      :teams="snapshot.teams"
      :show-team-field="showAgentDialogTeamSelector"
      @close="closeAgentDialog"
    />
    <BenchAgentAssignmentDialog
      :visible="benchAssignmentDialogVisible"
      title="Assign to Bench Agent"
      confirm-label="Assign"
      :bench-templates="snapshot.bench"
      :bench-templates-by-team-id="benchByTeamId"
      :initial-new-team-name="pendingBenchAgentTeamName"
      :initial-team-id="pendingBenchAgentTeamId ?? activeTeam?.id ?? snapshot.activeTeamId"
      :teams="snapshot.teams"
      @close="closeBenchAssignmentDialog"
      @submit="assignWorkItemToBenchAgent"
    />
    <TeamDialog
      :visible="teamDialogVisible"
      :mode="teamDialogMode"
      :team="editingTeam"
      :remote-connections="snapshot.remoteConnections.connections"
      :create-team="createTeam"
      :load-remote-teams="loadRemoteTeams"
      :update-team="updateTeam"
      @close="teamDialogVisible = false"
    />
    <WhatsNewDialog
      :visible="whatsNewVisible"
      @close="whatsNewVisible = false"
    />
    <ImageAnnotationDialog
      :visible="imageAnnotationVisible"
      :image-src="imageAnnotationImageSource"
      :fallback-image-src="attachmentAnnotationTarget ? undefined : debugAnnotationScreenshotUrl"
      :initial-annotations="imageAnnotationInitialAnnotations"
      :initial-pixel-ratio="imageAnnotationPixelRatio"
      :file-name="imageAnnotationFileName"
      @close="closeImageAnnotation"
      @image-error="handleImageAnnotationError"
      @save="saveImageAnnotation"
    />
    <CodexResourceSharingMigrationDialog
      :blocked="codexResourceSharingBlocked"
      :pending="codexResourceSharingMigrationPending"
      :visible="codexResourceSharingMigrationRequired"
      @decline="declineCodexResourceSharingMigration"
      @migrate="migrateCodexResources"
    />
    <FileQuickOpen
      v-if="fileQuickOpenVisible"
      :files="agentFiles"
      @close="fileQuickOpenVisible = false"
      @select="currentAgent && openFilePreviewForAgent(currentAgent.id, $event)"
    />
  </main>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import debugAnnotationScreenshotUrl from '../../assets/debug-annotation.png?url';
import { PRIMARY_BROWSER_ID, type AddSshConnectionInput, type Agent, type AgentFileActivity, type AgentFilePreviewResult, type AgentFileSearchItem, type AgentGitStatus, type AgentSubagentTree, type AppCommand, type ApprovalPreset, type AppSnapshot, type BackendApprovalDecision, type BackendApprovalRequest, type BackendApprovalScope, type BackendCapabilities, type BackendCommandSummary, type BackendConnectionState, type BackendConversationRef, type BackendPermissionModeOption, type BenchLocation, type BenchTemplate, type BackendModelOption, type BackendPluginSummary, type BackendRuntimeStatus, type BackendSkillSummary, type ClawdDaemonStatus, type ClientRequestResponse, type CodexAuthentication, type ConversationFileLink, type ConversationSummary, type CreateAgentInput, type CreateLoopInput, type CreateSourceWorktreeInput, type CreateTeamInput, type DeployBenchTemplateInput, type DesktopUpdateStatus, type DevicePairingSession, type DevicePairingStatus, type LoopLocation, type MoveAgentToTeamInput, type OpenInApplication, type OpenInApplicationCatalog, type PairedDevice, type RendererPromptAttachment, type ReasoningEffort, type RemoveBenchTemplateInput, type RendererMessage, type ReorderAgentsInput, type ReorderTeamsInput, type RendererSendPromptOptions, type SetCodexResourceSharingInput, type SidePanelMarkdownRequest, type SidePanelRequest, type SourceFolderListing, type SourceFolderListInput, type SourceRepository, type SourceWorktree, type SshHostCandidate, type Team, type ThreadGoal, type ThreadPlan, type UpdateAgentInput, type UpdateLoopInput, type UpdateRemoteConnectionInput, type UpdateSettingsInput, type UpdateTeamInput, type WorkBacklogConfigurationInput, type WorkItem, type WorkItemQuery, type WorkProviderAuthorization, type WorkProviderKind, type WorkRepository } from '@codex-claw/core/contracts';
import { defaultBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { createEmptySnapshot } from '@codex-claw/core/snapshot';
import { defaultTeamColor } from '@codex-claw/core/team-colors';
import { findAssignedAgentForWorkItem } from '@codex-claw/core/work-assignments';
import { clawHostCapabilities, codexClawApi } from '../platform-api';
import AgentDialog from './AgentDialog.vue';
import AgentEmptyState from './AgentEmptyState.vue';
import AgentHeader from './AgentHeader.vue';
import AgentSidebar from './AgentSidebar.vue';
import CockpitView from './CockpitView.vue';
import ConversationPane from './ConversationPane.vue';
import ImageAnnotationDialog, { type ImageAnnotationSavePayload } from './ImageAnnotationDialog.vue';
import FileQuickOpen from './FileQuickOpen.vue';
import { centeredImageCropDataUrl, formatImageAnnotationPrompt, type SavedImageAnnotations } from './image-annotation';
import LoopsView from './LoopsView.vue';
import TeamDialog from './TeamDialog.vue';
import TeamRail from './TeamRail.vue';
import WhatsNewDialog from './WhatsNewDialog.vue';
import BenchAgentAssignmentDialog from './BenchAgentAssignmentDialog.vue';
import RightWorkspacePanel from './RightWorkspacePanel.vue';
import SettingsView from './SettingsView.vue';
import CodexLoginLanding from './CodexLoginLanding.vue';
import CodexResourceSharingMigrationDialog from './CodexResourceSharingMigrationDialog.vue';
import type { SettingsTab } from './settings-tabs';
import { confirmCloseTeam } from './team-close-confirmation';
import {
  createCodexConversationPaneController,
  getCodexNativeRendererApi,
  type CodexCapabilities,
  type CodexConversationLink,
  type CodexConversationPaneActions,
  type CodexConversationPaneState,
  type CodexConversationVisualization,
  type CodexComposerMenuItem,
  type CodexMessageImage,
  type CodexMessageImageContext,
  type CodexNativeAttachment,
  type CodexComposerState,
  languageForFilePath,
  type CodexQueuedPromptData as QueuedChatPrompt,
  type CodexRendererSendMessageOptions,
} from '@codex-app-sdk/vue';
import { ShieldCheckIcon } from '../shared/icons/app-icons';
import { workItemAssignmentPrompt, workItemComposerPrompt } from '@codex-claw/core/work-item-prompts';

import type { PlanReviewComment, SidePanelGitDiffState, SidePanelImageState, SidePanelMarkdownState } from './side-panel';
import {
  isRightWorkspaceFileTab,
  isRightWorkspaceDiffTab,
  isRightWorkspaceImageTab,
  isRightWorkspaceSubagentTab,
  rightWorkspaceDiffTab,
  rightWorkspaceFileTab,
  rightWorkspaceImageTab,
  rightWorkspaceMarkdownTab,
  rightWorkspaceSubagentConversationId,
  rightWorkspaceSubagentTab,
  type RightWorkspaceDiffPanel,
  type RightWorkspaceDiffTab,
  type RightWorkspaceFilePanel,
  type RightWorkspaceFileTab,
  type RightWorkspaceImageTab,
  type RightWorkspaceTab,
  type RepositoryWorkStartInput,
} from './right-workspace';

const props = withDefaults(defineProps<{
  snapshot: AppSnapshot;
  activeAgent: Agent | null;
  unreadAgentIds?: string[];
  agentFiles?: AgentFileSearchItem[];
  messages: RendererMessage[];
  isLoading: boolean;
  isConversationLoading?: boolean;
  historyHasOlder?: boolean;
  historyLoadingOlder?: boolean;
  isSending: boolean;
  connectionState?: BackendConnectionState;
  goal?: ThreadGoal | null;
  approvals?: BackendApprovalRequest[];
  approvalPreset?: ApprovalPreset | null;
  permissionMode?: string | null;
  answeredClientRequestIds?: Set<string>;
  backendModels?: BackendModelOption[];
  backendCommands?: BackendCommandSummary[];
  backendPlugins?: BackendPluginSummary[];
  backendSkills?: BackendSkillSummary[];
  backendCapabilities?: BackendCapabilities;
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  skillCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  selectedModelId?: string | null;
  selectedReasoningEffort?: ReasoningEffort | null;
  selectedServiceTier?: string | null;
  planMode?: boolean;
  queuedPrompts?: QueuedChatPrompt[];
  composerState?: CodexComposerState;
  composerAttachments?: readonly CodexNativeAttachment[];
  updateStatus?: DesktopUpdateStatus;
  sidePanelRequest?: SidePanelRequest | null;
  fileActivity?: AgentFileActivity | null;
  workProviderAuthorization?: WorkProviderAuthorization | null;
  workRepositoriesByProvider?: Partial<Record<WorkProviderKind, WorkRepository[]>>;
  workItemsByRepository?: Record<string, WorkItem[]>;
  workBacklogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  workBacklogError?: string | null;
  remoteBenchByConnectionId?: Record<string, BenchTemplate[]>;
  remoteBenchStatusByConnectionId?: Record<string, BenchLoadStatus>;
  remoteBenchErrorByConnectionId?: Record<string, string | null>;
  daemonStatus?: ClawdDaemonStatus | null;
  daemonStatusError?: string | null;
  codexResourceSharingMigrationRequired?: boolean;
  chooseAgentFolder?: () => Promise<string | null>;
  chooseCodexBinary?: () => Promise<string | null>;
  chooseSourceFolder?: () => Promise<string | null>;
  listSourceFolders?: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  sourceRepositories?: SourceRepository[];
  listSourceRepositories?: (remoteConnectionId?: string) => Promise<SourceRepository[]>;
  listSourceWorktrees?: (repoPath: string, remoteConnectionId?: string) => Promise<SourceWorktree[]>;
  suggestSourceWorktreePath?: (input: Pick<CreateSourceWorktreeInput, 'branchName' | 'repoPath' | 'remoteConnectionId'>) => Promise<string>;
  chooseSourceWorktreeDestination?: (defaultPath: string) => Promise<string | null>;
  createSourceWorktree?: (input: CreateSourceWorktreeInput) => Promise<SourceWorktree>;
  previewAgentFile?: (agentId: string, filePath: string) => Promise<AgentFilePreviewResult>;
  openAgentGitDiff?: (agentId: string) => Promise<void>;
  getAgentGitWorkflow?: (agentId: string) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  generateAgentGitMessage?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitMessageGenerationInput) => Promise<import('@codex-claw/core/contracts').AgentGitMessageGenerationResult>;
  stageAgentGitFiles?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitStageInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  commitAgentGitChanges?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitCommitInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  pushAgentGitBranch?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitPushInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  createAgentGitBranch?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitBranchInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  createAgentGitPullRequest?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitPullRequestInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  mergeAgentGitBranch?: (agentId: string, input: import('@codex-claw/core/contracts').AgentGitMergeInput) => Promise<import('@codex-claw/core/contracts').AgentGitWorkflow>;
  openInApplications?: OpenInApplicationCatalog;
  openAgentPath?: (agentId: string, application: OpenInApplication, filePath?: string) => Promise<void>;
  createAgent?: (input: CreateAgentInput) => Promise<Agent | null | void>;
  createTeam?: (input: CreateTeamInput) => Promise<Team | null | void>;
  deployBenchTemplateAction?: (input: string | DeployBenchTemplateInput) => Promise<Agent | null | void>;
  updateTeam?: (input: UpdateTeamInput) => Promise<void>;
  updateAgent?: (input: UpdateAgentInput) => Promise<void>;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
  setCodexResourceSharing?: (input: SetCodexResourceSharingInput) => Promise<void>;
  getPluginStatus?: () => Promise<import('@codex-claw/core/contracts').AppPluginStatus>;
  listSshHosts?: () => Promise<SshHostCandidate[]>;
  addSshConnection?: (input: AddSshConnectionInput) => Promise<void>;
  checkRemoteConnection?: (connectionId: string) => Promise<void>;
  updateRemoteConnection?: (connectionId: string, input: UpdateRemoteConnectionInput) => Promise<void>;
  removeRemoteConnection?: (connectionId: string) => Promise<void>;
  getDevicePairingStatus?: () => Promise<DevicePairingStatus>;
  enableDevicePairing?: () => Promise<DevicePairingStatus>;
  disableDevicePairing?: () => Promise<DevicePairingStatus>;
  startDevicePairing?: () => Promise<DevicePairingSession>;
  checkDevicePairing?: (session: DevicePairingSession) => Promise<boolean>;
  listPairedDevices?: (environmentId: string) => Promise<PairedDevice[]>;
  revokePairedDevice?: (environmentId: string, clientId: string) => Promise<void>;
  setDaemonEnabled?: (enabled: boolean) => Promise<void>;
  restartApp?: () => Promise<void>;
  getLoopSnapshot?: (location?: LoopLocation) => Promise<AppSnapshot>;
  createLoop?: (input: CreateLoopInput, location?: LoopLocation) => Promise<AppSnapshot | void>;
  updateLoop?: (input: UpdateLoopInput, location?: LoopLocation) => Promise<AppSnapshot | void>;
  runLoop?: (loopId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  clearLoopHistory?: (loopId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  deleteLoopExecution?: (loopId: string, executionId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  deleteLoop?: (loopId: string, location?: LoopLocation) => Promise<AppSnapshot | void>;
  listAgentConversations?: (agentId: string) => Promise<ConversationSummary[]>;
  resumeAgentConversation?: (agentId: string, ref: BackendConversationRef) => Promise<void>;
  readConversationMessages?: (ref: BackendConversationRef, agentId: string, location?: LoopLocation) => Promise<RendererMessage[]>;
  connectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  openWorkProviderAuthorization?: (provider: WorkProviderKind) => Promise<void>;
  completeWorkProviderConnection?: (provider: WorkProviderKind) => Promise<void>;
  disconnectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  configureWorkBacklog?: (input: WorkBacklogConfigurationInput) => Promise<void>;
  loadBench?: (location?: BenchLocation) => Promise<BenchTemplate[] | void>;
  loadWorkRepositories?: (provider: WorkProviderKind, location?: LoopLocation) => Promise<WorkRepository[] | void>;
  loadWorkItems?: (provider: WorkProviderKind, repositoryId: string, location?: LoopLocation, query?: WorkItemQuery) => Promise<WorkItem[] | void>;
  createWorkItem?: (input: import('@codex-claw/core/contracts').CreateWorkItemInput) => Promise<WorkItem>;
  duplicateAgentAction?: (agentId: string, options?: import('@codex-claw/core/contracts').DuplicateAgentOptions) => Promise<Agent | null>;
  assignWorkItemAction?: (payload: { agentId: string; item: WorkItem; prompt?: string }) => Promise<void>;
  loadOlderAgentHistory?: (agentId: string) => Promise<void>;
  quit?: () => Promise<void>;
}>(), {
  answeredClientRequestIds: () => new Set<string>(),
  approvals: () => [],
  agentFiles: () => [],
  backendModels: () => [],
  backendCommands: () => [],
  backendPlugins: () => [],
  backendSkills: () => [],
  backendCapabilities: () => defaultBackendCapabilities('codex'),
  isConversationLoading: false,
  historyHasOlder: true,
  historyLoadingOlder: false,
  connectionState: () => ({ status: 'connected' }),
  modelCatalogStatus: 'notLoaded',
  skillCatalogStatus: 'notLoaded',
  selectedModelId: null,
  selectedReasoningEffort: null,
  selectedServiceTier: null,
  approvalPreset: null,
  permissionMode: null,
  queuedPrompts: () => [],
  composerState: () => ({ text: '', selectionStart: 0, selectionEnd: 0 }),
  composerAttachments: () => [],
  sidePanelRequest: null,
  fileActivity: null,
  workProviderAuthorization: null,
  workRepositoriesByProvider: () => ({}),
  workItemsByRepository: () => ({}),
  workBacklogStatus: 'notLoaded',
  workBacklogError: null,
  remoteBenchByConnectionId: () => ({}),
  remoteBenchStatusByConnectionId: () => ({}),
  remoteBenchErrorByConnectionId: () => ({}),
  daemonStatus: null,
  daemonStatusError: null,
  codexResourceSharingMigrationRequired: false,
  chooseAgentFolder: async () => null,
  chooseCodexBinary: async () => null,
  chooseSourceFolder: async () => null,
  listSourceFolders: async () => ({ path: '', parentPath: null, entries: [] }),
  sourceRepositories: () => [],
  listSourceRepositories: async () => [],
  suggestSourceWorktreePath: async () => '',
  chooseSourceWorktreeDestination: async () => null,
  createSourceWorktree: async () => ({ name: '', path: '' }),
  previewAgentFile: async () => {
    throw new Error('File preview is not available.');
  },
  openAgentGitDiff: async () => {
    throw new Error('Git diff preview is not available.');
  },
  getAgentGitWorkflow: async () => { throw new Error('Git workflow is not available.'); },
  generateAgentGitMessage: async () => { throw new Error('Git message generation is not available.'); },
  stageAgentGitFiles: async () => { throw new Error('Git staging is not available.'); },
  commitAgentGitChanges: async () => { throw new Error('Git commit is not available.'); },
  pushAgentGitBranch: async () => { throw new Error('Git push is not available.'); },
  createAgentGitBranch: async () => { throw new Error('Git branch creation is not available.'); },
  createAgentGitPullRequest: async () => { throw new Error('Pull request creation is not available.'); },
  mergeAgentGitBranch: async () => { throw new Error('Git merge is not available.'); },
  openInApplications: () => ({ defaultApplication: 'finder', applications: [] }),
  openAgentPath: async () => {
    throw new Error('Open In is not available.');
  },
  createAgent: async () => undefined,
  createTeam: async () => undefined,
  deployBenchTemplateAction: async () => undefined,
  updateTeam: async () => undefined,
  updateAgent: async () => undefined,
  updateSettings: async () => undefined,
  setCodexResourceSharing: async () => undefined,
  getPluginStatus: async () => ({ chromeEnabled: false }),
  listSshHosts: async () => [],
  addSshConnection: async () => undefined,
  checkRemoteConnection: async () => undefined,
  updateRemoteConnection: async () => undefined,
  removeRemoteConnection: async () => undefined,
  getDevicePairingStatus: async () => ({ status: 'disabled' as const }),
  enableDevicePairing: async () => ({ status: 'disabled' as const }),
  disableDevicePairing: async () => ({ status: 'disabled' as const }),
  startDevicePairing: async () => ({ pairingCode: '', environmentId: '', expiresAt: '' }),
  checkDevicePairing: async () => false,
  listPairedDevices: async () => [],
  revokePairedDevice: async () => undefined,
  setDaemonEnabled: async () => undefined,
  restartApp: async () => undefined,
  getLoopSnapshot: async () => createEmptySnapshot(),
  createLoop: async () => undefined,
  updateLoop: async () => undefined,
  runLoop: async () => undefined,
  clearLoopHistory: async () => undefined,
  deleteLoopExecution: async () => undefined,
  deleteLoop: async () => undefined,
  listAgentConversations: async () => [],
  resumeAgentConversation: async () => undefined,
  readConversationMessages: async () => [],
  connectWorkProvider: async () => undefined,
  openWorkProviderAuthorization: async () => undefined,
  completeWorkProviderConnection: async () => undefined,
  disconnectWorkProvider: async () => undefined,
  configureWorkBacklog: async () => undefined,
  loadBench: async () => undefined,
  loadWorkRepositories: async () => undefined,
  loadWorkItems: async () => undefined,
  createWorkItem: async () => { throw new Error('Issue creation is not available.'); },
  duplicateAgentAction: async () => null,
  assignWorkItemAction: async () => undefined,
  quit: async () => undefined,
});

const emit = defineEmits<{
  'close-team': [teamId: string];
  'disconnect-team': [teamId: string];
  'close-agent': [agentId: string];
  'clear-goal': [];
  'client-response': [response: ClientRequestResponse];
  'delete-message': [index: number];
  'delete-queued-prompt': [promptId: string];
  'debug-mark-unread': [];
  'deploy-bench-template': [input: string | DeployBenchTemplateInput];
  'duplicate-agent': [agentId: string];
  'fork-agent': [agentId: string];
  'fork-message': [index: number];
  'edit-message': [payload: { content: string; index: number }];
  'interrupt-agent': [];
  'move-agent-to-team': [input: MoveAgentToTeamInput];
  'reorder-agents': [input: ReorderAgentsInput];
  'reorder-teams': [input: ReorderTeamsInput];
  'assign-work-item': [payload: { agentId: string; item: WorkItem }];
  'remove-work-item-assignment': [item: WorkItem];
  'restart-agent': [agentId: string];
  'remove-bench-template': [input: string | RemoveBenchTemplateInput];
  'resolve-approval': [approvalId: string, decision: BackendApprovalDecision, scope: BackendApprovalScope];
  'retry-message': [index: number];
  'save-agent-to-bench': [agentId: string];
  'send-agent-prompt': [payload: { agentId: string; prompt: string }];
  'select-agent': [agentId: string];
  'select-model': [modelId: string];
  'select-reasoning-effort': [reasoningEffort: ReasoningEffort];
  'select-service-tier': [serviceTier: string | null];
  'select-approval-preset': [preset: ApprovalPreset];
  'select-permission-mode': [mode: string];
  'select-team': [teamId: string];
  'steer-queued-prompt': [promptId: string, prompt?: string];
  'update-queued-prompt': [promptId: string, prompt: string];
  'update:planMode': [enabled: boolean];
  'update:composerState': [payload: { agentId: string; state: CodexComposerState }];
  'update:composerAttachments': [payload: { agentId: string; attachments: readonly CodexNativeAttachment[] }];
  'install-update': [];
  sendPrompt: [prompt: string, options?: RendererSendPromptOptions];
  steerPrompt: [prompt: string, options?: RendererSendPromptOptions];
}>();

type WorkItemAssignmentIntent = {
  item: WorkItem;
  teamId?: string;
};

type CockpitBacklogConfiguration = {
  assigneeLogin: string | null;
  repositoryId: string | null;
  tagName: string | null;
};

type AttachmentAnnotationTarget = {
  agentId: string;
  attachment: CodexNativeAttachment;
};

type AppSurface = 'agent' | 'cockpit' | 'loops' | 'settings';
type BenchLoadStatus = 'notLoaded' | 'loading' | 'loaded' | 'error';
type AgentRightWorkspaceState = {
  activeTab: RightWorkspaceTab | null;
  backlogError: string | null;
  backlogItems: WorkItem[];
  backlogStatus: 'notLoaded' | 'loading' | 'loaded' | 'error';
  browserId: string;
  browserInitialUrl: string;
  browserOpenRequestId: number;
  browserVisualization: CodexConversationVisualization | null;
  filePanels: Partial<Record<RightWorkspaceFileTab, RightWorkspaceFilePanel>>;
  filesPaneOpen: boolean;
  filesPaneWidth: number;
  filePreviewRequestIds: Partial<Record<RightWorkspaceFileTab, number>>;
  diffPanels: Partial<Record<RightWorkspaceDiffTab, RightWorkspaceDiffPanel>>;
  gitReviewPanel: SidePanelGitDiffState | null;
  imagePanels: Partial<Record<RightWorkspaceImageTab, SidePanelImageState>>;
  planPanel: SidePanelMarkdownState | null;
  open: boolean;
  tabs: RightWorkspaceTab[];
  width: number;
};

const agentSidebarCollapsed = ref(false);
const codexResourceSharingMigrationPending = ref(false);
const agentListCompact = computed(() => props.snapshot.general.agentListCompact);
const codexResourceSharingBlocked = computed(() => props.snapshot.agents.some((agent) => (
  agent.status.type === 'starting' ||
  agent.status.type === 'working' ||
  agent.status.type === 'awaitingInput'
)));
const connectionStatusLabel = computed(() => {
  if (props.connectionState.status === 'connecting') return 'Connecting to clawd…';
  if (props.connectionState.status === 'reconnecting') return 'Reconnecting to clawd… Agents keep working in the background.';
  return 'Clawd is unavailable. Reconnection will continue automatically.';
});
const agentSidebarMinWidth = 80;
const agentSidebarMaxWidth = 420;
const agentSidebarWidth = ref(260);
const activeSurface = ref<AppSurface>('agent');
const rightWorkspaces = reactive<Record<string, AgentRightWorkspaceState>>({});
const fileQuickOpenVisible = ref(false);
const attachmentAnnotationsByAgentId = reactive<Record<string, Record<string, SavedImageAnnotations>>>({});
const executionPlanStates = reactive<Record<string, { open: boolean; turnId: string }>>({});
const quickAgentShortcutsVisible = ref(false);
const debugApproval = ref<{ agentId: string; request: BackendApprovalRequest } | null>(null);
const workspaceBody = ref<HTMLElement | null>(null);
const conversationPane = ref<{ focusComposer(): void } | null>(null);
const authentication = ref<CodexAuthentication | null>(null);
const authenticationLoading = ref(true);
const authenticationCancelling = ref(false);
const authenticationError = ref<string | null>(null);
let authenticationPoll: ReturnType<typeof setInterval> | null = null;
const settingsActiveTab = ref<SettingsTab>('general');
const agentDialogVisible = ref(false);
const agentDialogMode = ref<'create' | 'edit'>('create');
const editingAgentId = ref<string | null>(null);
const agentDialogTeamId = ref<string | null>(null);
const pendingNewAgentWorkItem = ref<WorkItem | null>(null);
const pendingBenchAgentWorkItem = ref<WorkItem | null>(null);
const pendingBenchAgentTeamId = ref<string | null>(null);
const pendingCockpitBacklogConfiguration = ref<CockpitBacklogConfiguration | null>(null);
const benchAssignmentDialogVisible = ref(false);
const teamDialogVisible = ref(false);
const teamDialogMode = ref<'create' | 'edit'>('create');
const whatsNewVisible = ref(false);
const debugImageAnnotationVisible = ref(false);
const debugAnnotationPixelRatio = ref<1 | 2>(1);
const debugAnnotationImageSource = ref(debugAnnotationScreenshotUrl);
const attachmentAnnotationTarget = ref<AttachmentAnnotationTarget | null>(null);
const editingTeamId = ref<string | null>(null);
let filePreviewRequestId = 0;
let markdownPreviewId = 0;
let unsubscribeAppCommand: (() => void) | null = null;
let quickAgentShortcutTimer: ReturnType<typeof setTimeout> | null = null;
let commandKeyHeld = false;
const quickAgentShortcutDelayMs = 350;
const activeTeam = computed<Team | null>(() => {
  const selectedTeam = props.snapshot.activeTeamId
    ? props.snapshot.teams.find((team) => team.id === props.snapshot.activeTeamId) ?? null
    : null;
  if (selectedTeam) {
    return selectedTeam;
  }

  if (props.activeAgent?.teamId) {
    return props.snapshot.teams.find((team) => team.id === props.activeAgent?.teamId) ?? props.snapshot.teams[0] ?? null;
  }

  if (props.activeAgent) {
    return props.snapshot.teams.find((team) => team.agentIds.includes(props.activeAgent?.id ?? '')) ?? props.snapshot.teams[0] ?? null;
  }

  return props.snapshot.teams[0] ?? null;
});
const activeTeamAgents = computed(() => {
  const team = activeTeam.value;
  if (!team) {
    return [];
  }

  return team.agentIds
    .map((agentId) => props.snapshot.agents.find((agent) => agent.id === agentId))
    .filter((agent): agent is Agent => Boolean(agent));
});
const unreadTeamIds = computed(() => {
  const unreadAgentIdSet = new Set(props.unreadAgentIds);
  return props.snapshot.teams
    .filter((team) => (
      team.id !== activeTeam.value?.id && team.agentIds.some((agentId) => unreadAgentIdSet.has(agentId))
    ))
    .map((team) => team.id);
});
const forkableAgentIds = computed(() => props.snapshot.agents
  .filter((agent) => {
    const defaults = defaultBackendCapabilities(agent.backend);
    const runtime = props.snapshot.backendRuntimes.find((candidate) => candidate.backend === agent.backend);
    return (runtime?.capabilities?.conversationFork ?? defaults.conversationFork) === true;
  })
  .map((agent) => agent.id));
const currentAgent = computed(() => {
  const team = activeTeam.value;
  if (!team) {
    return null;
  }

  if (props.activeAgent && team.agentIds.includes(props.activeAgent.id)) {
    return props.activeAgent;
  }

  return activeTeamAgents.value.find((agent) => agent.id === team.activeAgentId) ?? activeTeamAgents.value[0] ?? null;
});
const effectiveApprovals = computed(() => {
  const fixture = debugApproval.value;
  return [
    ...(props.approvals ?? []),
    ...(fixture && fixture.agentId === currentAgent.value?.id ? [fixture.request] : []),
  ];
});
const currentBackendRuntime = computed<BackendRuntimeStatus>(() => {
  const backend = currentAgent.value?.backend ?? 'codex';
  return props.snapshot.backendRuntimes.find((runtime) => runtime.backend === backend) ?? {
    backend,
    status: 'notConfigured',
  };
});
const currentAgentGitStatus = computed<AgentGitStatus | null>(() => {
  const agentId = currentAgent.value?.id;
  return agentId ? props.snapshot.agentGitStatuses[agentId] ?? null : null;
});
const currentSubagentTree = computed<AgentSubagentTree | null>(() => {
  const agentId = currentAgent.value?.id;
  return agentId ? subagentTreeFor(agentId) : null;
});
watch(() => props.snapshot.agents.map((agent) => (
  `${agent.id}:${agent.backendSession?.kind === 'codex' ? agent.backendSession.threadId : ''}:${props.snapshot.subagentTrees[agent.id]?.rootConversationId ?? ''}:${Object.keys(props.snapshot.subagentTrees[agent.id]?.nodes ?? {}).sort().join(',')}`
)), () => {
  for (const [agentId, workspace] of Object.entries(rightWorkspaces)) {
    for (const tab of workspace.tabs.filter(isRightWorkspaceSubagentTab)) {
      const conversationId = rightWorkspaceSubagentConversationId(tab);
      if (!subagentTreeFor(agentId)?.nodes[conversationId]) {
        closeRightWorkspaceTab(agentId, tab);
      }
    }
  }
});
const currentTurnPlan = computed<ThreadPlan | null>(() => {
  const plan = currentAgent.value?.plan;
  if (!plan?.steps.length) {
    return null;
  }
  if (props.isConversationLoading && props.messages.length === 0) {
    return null;
  }

  let latestTurnId: string | undefined;
  for (let index = props.messages.length - 1; index >= 0; index -= 1) {
    if (props.messages[index]?.turnId) {
      latestTurnId = props.messages[index].turnId;
      break;
    }
  }

  return !latestTurnId || latestTurnId === plan.turnId ? plan : null;
});
const executionPlanVisible = computed(() => {
  const agentId = currentAgent.value?.id;
  const plan = currentTurnPlan.value;
  if (!agentId || !plan) {
    return false;
  }

  return executionPlanStates[agentId]?.turnId === plan.turnId
    ? executionPlanStates[agentId].open
    : true;
});

const conversationKey = computed(() => {
  const session = currentAgent.value?.backendSession;
  if (session?.kind === 'codex') return `codex:${session.threadId}`;
  if (session?.kind === 'claude') return `claude:${session.sessionId}`;
  return currentAgent.value ? `agent:${currentAgent.value.id}` : 'no-agent';
});
const conversationCapabilities = computed<CodexCapabilities>(() => ({
  models: props.backendCapabilities.models,
  skills: props.backendCapabilities.skills,
  reasoningEffort: props.backendCapabilities.reasoningEffort,
  ...(props.backendCapabilities.serviceTier === undefined
    ? {}
    : { serviceTier: props.backendCapabilities.serviceTier }),
  planMode: props.backendCapabilities.planMode !== 'unsupported',
  goals: props.backendCapabilities.goals,
  steerPrompt: props.backendCapabilities.steerPrompt,
  interrupt: props.backendCapabilities.interrupt,
  history: props.backendCapabilities.history,
  rollback: props.backendCapabilities.rollback,
  editMessage: props.backendCapabilities.editMessage,
  retryMessage: props.backendCapabilities.retryMessage,
  approvals: props.backendCapabilities.approvals,
  approvalPresets: props.backendCapabilities.approvalPresets ?? [],
}));
const permissionModeMenuItems = computed<CodexComposerMenuItem[]>(() => {
  const modes = props.backendCapabilities.permissionModes ?? [];
  if (modes.length === 0) {
    return [];
  }

  return [{
    id: 'backend-permissions',
    type: 'submenu',
    label: 'Permissions',
    icon: ShieldCheckIcon,
    submenuAlignment: 'bottom',
    submenuWidth: 'wide',
    items: modes.map((mode) => permissionModeMenuItem(mode, props.permissionMode)),
  }];
});
const conversationPaneState: CodexConversationPaneState = {
  identity: {
    get conversationKey() { return conversationKey.value; },
    get messages() { return props.messages; },
    get busy() { return props.isSending; },
    get disabled() { return !currentAgent.value; },
  },
  history: {
    get hasOlder() { return props.historyHasOlder; },
    get loading() {
      return Boolean(currentAgent.value?.backendSession)
        && props.messages.length === 0
        && (props.isLoading || props.isConversationLoading);
    },
    get loadingOlder() { return props.historyLoadingOlder; },
  },
  thread: {
    get approvals() { return effectiveApprovals.value; },
    get answeredClientRequestIds() { return props.answeredClientRequestIds; },
    get goal() { return props.goal ?? null; },
    get queuedPrompts() { return props.queuedPrompts; },
    get contextUsage() { return currentAgent.value?.contextUsage ?? null; },
  },
  composer: {
    get state() { return props.composerState; },
    get attachments() { return props.composerAttachments; },
    get placeholder() {
      if (!currentAgent.value) return 'Select an agent';
      const backend = currentAgent.value.backend === 'claude' ? 'Claude' : 'Codex';
      return props.isSending ? `${backend} is working...` : 'Ask for follow-up changes';
    },
    get approvalPreset() { return props.approvalPreset; },
    get leadingMenuItems() { return permissionModeMenuItems.value; },
    get planMode() { return props.planMode; },
    get selectedModelId() { return props.selectedModelId; },
    get selectedReasoningEffort() { return props.selectedReasoningEffort; },
    get selectedServiceTier() { return props.selectedServiceTier; },
  },
  catalogs: {
    get files() { return props.agentFiles; },
    get models() { return props.backendModels; },
    get commands() { return props.backendCommands; },
    get plugins() { return props.backendPlugins; },
    get skills() { return props.backendSkills; },
    get modelCatalogStatus() { return props.modelCatalogStatus; },
    get skillCatalogStatus() { return props.skillCatalogStatus; },
  },
  get capabilities() { return conversationCapabilities.value; },
  policy: {
    get attachEnabled() { return props.backendCapabilities.attachments; },
    get canDeleteMessage() { return props.backendCapabilities.rollback; },
    get canEditMessage() { return props.backendCapabilities.editMessage; },
    get canForkMessage() {
      const agent = currentAgent.value;
      return Boolean(agent && forkableAgentIds.value.includes(agent.id));
    },
    get canRetryMessage() { return props.backendCapabilities.retryMessage; },
  },
};
const conversationPaneActions: CodexConversationPaneActions = {
  clearGoal: () => emit('clear-goal'),
  clientResponse: (response) => emit('client-response', response),
  deleteMessage: (index) => emit('delete-message', index),
  deleteQueuedPrompt: (promptId) => emit('delete-queued-prompt', promptId),
  editMessage: (payload) => emit('edit-message', payload),
  forkMessage: (index) => emit('fork-message', index),
  interrupt: () => emit('interrupt-agent'),
  loadOlderHistory: () => props.loadOlderAgentHistory?.(currentAgent.value?.id ?? ''),
  menuSelect: (item) => {
    const command = permissionModeCommand(item.payload);
    if (command) emit('select-permission-mode', command.mode);
  },
  openLink: openConversationLink,
  openImage: openConversationImage,
  openVisualization: openConversationVisualization,
  resolveApproval: forwardApprovalResolution,
  retryMessage: (index) => emit('retry-message', index),
  steer: forwardCodexSteerPrompt,
  steerQueuedPrompt: (promptId, prompt) => emit('steer-queued-prompt', promptId, prompt),
  updateQueuedPrompt: (promptId, prompt) => emit('update-queued-prompt', promptId, prompt),
  submit: forwardCodexPrompt,
  updateAttachments: updateConversationAttachments,
  updateComposerState: updateConversationComposerState,
  updateSettings: (settings) => {
    if (settings.approvalPreset !== undefined) emit('select-approval-preset', settings.approvalPreset);
    if (settings.modelId !== undefined) emit('select-model', settings.modelId);
    if (settings.planMode !== undefined) emit('update:planMode', settings.planMode);
    if (settings.reasoningEffort !== undefined) emit('select-reasoning-effort', settings.reasoningEffort);
    if (settings.serviceTier !== undefined) emit('select-service-tier', settings.serviceTier);
  },
};

function permissionModeMenuItem(
  mode: BackendPermissionModeOption,
  selectedMode: string | null,
): CodexComposerMenuItem {
  return {
    id: `permission-mode:${mode.id}`,
    type: 'radio',
    label: mode.label,
    description: mode.description,
    checked: mode.id === selectedMode,
    payload: { kind: 'permission-mode', mode: mode.id },
  };
}

function permissionModeCommand(payload: unknown): { kind: 'permission-mode'; mode: string } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  return record.kind === 'permission-mode' && typeof record.mode === 'string'
    ? { kind: 'permission-mode', mode: record.mode }
    : null;
}
const conversationPaneController = createCodexConversationPaneController({
  state: conversationPaneState,
  actions: conversationPaneActions,
});

watch(() => ({
  agentId: currentAgent.value?.id ?? null,
  turnId: currentTurnPlan.value?.turnId ?? null,
}), ({ agentId, turnId }) => {
  if (!agentId || !turnId) {
    return;
  }

  const existing = executionPlanStates[agentId];
  if (!existing || existing.turnId !== turnId) {
    executionPlanStates[agentId] = { open: true, turnId };
  }
}, { immediate: true });

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
const rightWorkspaceVisible = computed(() => {
  const agentId = currentAgent.value?.id;
  return Boolean(agentId && rightWorkspaceFor(agentId).open);
});
const savedCockpitBacklogConfiguration = computed<CockpitBacklogConfiguration>(() => {
  const configuration = props.snapshot.workBacklog.providerConfigurations.github ?? {};
  return normalizedCockpitBacklogConfiguration({
    repositoryId: configuration.repositoryId ?? null,
    assigneeLogin: configuration.assigneeLogin ?? null,
    tagName: configuration.tagName ?? null,
  });
});
const effectiveCockpitBacklogConfiguration = computed<CockpitBacklogConfiguration>(() => (
  pendingCockpitBacklogConfiguration.value ?? savedCockpitBacklogConfiguration.value
));
const cockpitWorkBacklog = computed(() => {
  const connection = props.snapshot.workBacklog.connections.find((candidate) => candidate.provider === 'github');
  if (!connection || connection.status !== 'connected') {
    return null;
  }

  const provider = connection.provider;
  const repositories = props.workRepositoriesByProvider[provider] ?? [];
  const configuration = effectiveCockpitBacklogConfiguration.value;
  const selectedRepositoryId = configuration.repositoryId ?? repositories[0]?.id ?? null;

  return {
    assignments: props.snapshot.workBacklog.assignments,
    connection,
    repositories,
    selectedAssigneeLogin: configuration.assigneeLogin ?? null,
    selectedRepositoryId,
    selectedTagName: configuration.tagName ?? null,
    items: selectedRepositoryId ? props.workItemsByRepository[workItemsKey(provider, selectedRepositoryId)] ?? [] : [],
    status: props.workBacklogStatus,
    error: props.workBacklogError,
  };
});

watch(savedCockpitBacklogConfiguration, (configuration) => {
  if (pendingCockpitBacklogConfiguration.value && sameCockpitBacklogConfiguration(pendingCockpitBacklogConfiguration.value, configuration)) {
    pendingCockpitBacklogConfiguration.value = null;
  }
});
const showAgentDialogTeamSelector = computed(() => agentDialogMode.value === 'create' && pendingNewAgentWorkItem.value !== null);
const pendingNewAgentTeamName = computed(() => pendingNewAgentWorkItem.value ? workItemTeamName(pendingNewAgentWorkItem.value) : '');
const pendingBenchAgentTeamName = computed(() => pendingBenchAgentWorkItem.value ? workItemTeamName(pendingBenchAgentWorkItem.value) : '');
const isAgentEmpty = computed(() => activeTeamAgents.value.length === 0);
const cockpitVisible = computed(() => activeSurface.value === 'cockpit');
const loopsVisible = computed(() => activeSurface.value === 'loops');
const settingsVisible = computed(() => activeSurface.value === 'settings');
const isAgentWorkspaceVisible = computed(() => activeSurface.value === 'agent');
const imageAnnotationVisible = computed(() => (
  debugImageAnnotationVisible.value || attachmentAnnotationTarget.value !== null
));
const imageAnnotationImageSource = computed(() => (
  attachmentAnnotationTarget.value?.attachment.previewUrl ?? debugAnnotationImageSource.value
));
const imageAnnotationSavedDraft = computed<SavedImageAnnotations | null>(() => {
  const target = attachmentAnnotationTarget.value;
  return target ? attachmentAnnotationsByAgentId[target.agentId]?.[target.attachment.reference] ?? null : null;
});
const imageAnnotationInitialAnnotations = computed(() => imageAnnotationSavedDraft.value?.annotations ?? []);
const imageAnnotationPixelRatio = computed<1 | 2>(() => (
  attachmentAnnotationTarget.value
    ? imageAnnotationSavedDraft.value?.pixelRatio ?? 1
    : debugAnnotationPixelRatio.value
));
const imageAnnotationFileName = computed(() => {
  const name = attachmentAnnotationTarget.value?.attachment.name;
  if (!name) return 'codex-claw-annotated.png';
  const baseName = name.replace(/\.[^.]+$/, '') || 'image';
  return `${baseName}-annotated.png`;
});
const activeAttachmentAnnotationCounts = computed<Readonly<Record<string, number>>>(() => {
  const agentId = currentAgent.value?.id;
  const saved = agentId ? attachmentAnnotationsByAgentId[agentId] ?? {} : {};
  return Object.fromEntries(Object.entries(saved).map(([reference, draft]) => [reference, draft.annotations.length]));
});
const isModalDialogVisible = computed(() => (
  agentDialogVisible.value
  || benchAssignmentDialogVisible.value
  || teamDialogVisible.value
  || whatsNewVisible.value
  || imageAnnotationVisible.value
  || fileQuickOpenVisible.value
  || props.codexResourceSharingMigrationRequired
));
const showAgentSidebar = computed(() => isAgentWorkspaceVisible.value && !agentSidebarCollapsed.value && !isAgentEmpty.value);
const showLoginLanding = computed(() => (
  authenticationLoading.value ||
  (authentication.value?.account === null && authentication.value.requiresOpenaiAuth)
));
const editingAgent = computed(() => (
  editingAgentId.value ? props.snapshot.agents.find((agent) => agent.id === editingAgentId.value) ?? null : null
));
const editingTeam = computed(() => (
  editingTeamId.value ? props.snapshot.teams.find((team) => team.id === editingTeamId.value) ?? null : null
));
const agentDialogTargetTeam = computed(() => {
  const targetTeamId = agentDialogTeamId.value ?? activeTeam.value?.id ?? props.snapshot.activeTeamId;
  return targetTeamId
    ? props.snapshot.teams.find((team) => team.id === targetTeamId) ?? null
    : null;
});
const agentDialogRemoteConnectionId = computed(() => agentDialogTargetTeam.value?.remoteConnectionId ?? '');
function isPlanPreviewUpdatingFor(agentId: string): boolean {
  const panel = rightWorkspaceFor(agentId).planPanel;
  if (!panel || panel.purpose !== 'plan') return false;
  return props.messages.some((message) => (
    message.agentId === agentId &&
    message.parts.some((part) => (
      part.type === 'tool' &&
      part.status === 'running' &&
      part.metadata?.planProgress === true
    ))
  ));
}

onMounted(() => {
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', handleShellShortcut);
    window.addEventListener('keyup', handleShellKeyup);
    window.addEventListener('blur', resetQuickAgentShortcuts);
  }
  unsubscribeAppCommand = codexClawApi?.onAppCommand?.(handleAppCommand) ?? null;
  void loadAuthentication();
});

onBeforeUnmount(() => {
  if (typeof window.removeEventListener === 'function') {
    window.removeEventListener('keydown', handleShellShortcut);
    window.removeEventListener('keyup', handleShellKeyup);
    window.removeEventListener('blur', resetQuickAgentShortcuts);
  }
  resetQuickAgentShortcuts();
  unsubscribeAppCommand?.();
  unsubscribeAppCommand = null;
  stopAuthenticationPolling();
});

async function loadAuthentication(): Promise<void> {
  authenticationLoading.value = true;
  authenticationError.value = null;
  try {
    if (!codexClawApi) {
      authentication.value = {
        account: { type: 'apiKey' },
        requiresOpenaiAuth: false,
        login: { status: 'idle', error: null },
      };
      return;
    }
    authentication.value = await codexClawApi.getCodexAuthentication();
  } catch (error) {
    authenticationError.value = error instanceof Error ? error.message : String(error);
  } finally {
    authenticationLoading.value = false;
  }
}

async function startChatGptLogin(): Promise<void> {
  authenticationLoading.value = true;
  authenticationError.value = null;
  try {
    const api = codexClawApi;
    if (!api) throw new Error('Codex Claw API is unavailable.');
    await api.startCodexChatGptLogin();
    authentication.value = {
      account: null,
      requiresOpenaiAuth: true,
      login: { status: 'pending', error: null },
    };
    startAuthenticationPolling();
  } catch (error) {
    authenticationError.value = error instanceof Error ? error.message : String(error);
  } finally {
    authenticationLoading.value = false;
  }
}

async function cancelChatGptLogin(): Promise<void> {
  authenticationCancelling.value = true;
  authenticationError.value = null;
  stopAuthenticationPolling();
  try {
    const api = codexClawApi;
    if (!api) throw new Error('Codex Claw API is unavailable.');
    authentication.value = await api.cancelCodexChatGptLogin();
  } catch (error) {
    authenticationError.value = error instanceof Error ? error.message : String(error);
  } finally {
    authenticationCancelling.value = false;
  }
}

async function logoutCodex(): Promise<void> {
  authenticationError.value = null;
  const api = codexClawApi;
  if (!api) throw new Error('Codex Claw API is unavailable.');
  authentication.value = await api.logoutCodex();
}

function startAuthenticationPolling(): void {
  stopAuthenticationPolling();
  const api = codexClawApi;
  if (!api) return;
  authenticationPoll = setInterval(() => {
    void api.getCodexAuthentication().then((next) => {
      authentication.value = next;
      if (next.account || next.login.status === 'error') stopAuthenticationPolling();
    }).catch((error) => {
      authenticationError.value = error instanceof Error ? error.message : String(error);
      stopAuthenticationPolling();
    });
  }, 1000);
}

function stopAuthenticationPolling(): void {
  if (authenticationPoll) clearInterval(authenticationPoll);
  authenticationPoll = null;
}

function setAgentSidebarWidth(width: number): void {
  agentSidebarWidth.value = Math.min(Math.max(width, agentSidebarMinWidth), agentSidebarMaxWidth);
}

function rightWorkspaceFor(agentId: string): AgentRightWorkspaceState {
  const existing = rightWorkspaces[agentId];
  if (existing) return existing;

  const created: AgentRightWorkspaceState = {
    activeTab: null,
    backlogError: null,
    backlogItems: [],
    backlogStatus: 'notLoaded',
    browserId: PRIMARY_BROWSER_ID,
    browserInitialUrl: '',
    browserOpenRequestId: 0,
    browserVisualization: null,
    filePanels: {},
    filesPaneOpen: false,
    filesPaneWidth: 280,
    filePreviewRequestIds: {},
    diffPanels: {},
    gitReviewPanel: null,
    imagePanels: {},
    planPanel: null,
    open: false,
    tabs: [],
    width: 420,
  };
  rightWorkspaces[agentId] = created;
  return created;
}

function isRightWorkspaceVisible(agentId: string): boolean {
  return currentAgent.value?.id === agentId && rightWorkspaceFor(agentId).open;
}

function effectiveGitReviewPanelFor(agent: Agent): SidePanelGitDiffState {
  return rightWorkspaceFor(agent.id).gitReviewPanel ?? {
    kind: 'gitDiff',
    title: 'Review',
    subtitle: agent.folder,
    diff: '',
    state: 'loading',
    error: null,
  };
}

function toggleRightWorkspace(): void {
  const agentId = currentAgent.value?.id;
  if (!agentId) return;
  const workspace = rightWorkspaceFor(agentId);
  if (rightWorkspaceVisible.value) {
    workspace.open = false;
    return;
  }

  workspace.open = true;
}

function openRightWorkspaceTab(tab: RightWorkspaceTab, agentId = currentAgent.value?.id): void {
  if (!agentId) return;
  const workspace = rightWorkspaceFor(agentId);
  if (!workspace.tabs.includes(tab)) {
    workspace.tabs = [...workspace.tabs, tab];
  }
  workspace.activeTab = tab;
  workspace.open = true;
}

function subagentTreeFor(agentId: string): AgentSubagentTree | null {
  const agent = props.snapshot.agents.find((candidate) => candidate.id === agentId);
  const tree = props.snapshot.subagentTrees[agentId];
  return agent?.backendSession?.kind === 'codex' && tree?.rootConversationId === agent.backendSession.threadId
    ? tree
    : null;
}

function openSubagent(agentId: string, conversationId: string): void {
  const tree = subagentTreeFor(agentId);
  if (!tree?.nodes[conversationId]) return;
  openRightWorkspaceTab(rightWorkspaceSubagentTab(conversationId), agentId);
}

function selectedSubagentConversationIdFor(agentId: string): string | null {
  const tab = rightWorkspaceFor(agentId).activeTab;
  return tab && isRightWorkspaceSubagentTab(tab)
    ? rightWorkspaceSubagentConversationId(tab)
    : null;
}

function loadSubagentMessages(agentId: string, conversationId: string): Promise<RendererMessage[]> {
  const tree = subagentTreeFor(agentId);
  if (!tree?.nodes[conversationId]) return Promise.reject(new Error('Subagent conversation is unavailable.'));
  return readConversationMessages({ backend: 'codex', threadId: conversationId }, agentId);
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
    workspace.backlogError = 'This repository is not connected to GitHub.';
    return;
  }

  workspace.backlogStatus = 'loading';
  workspace.backlogError = null;
  try {
    workspace.backlogItems = await props.loadWorkItems('github', repositoryId, undefined, {
      kind: 'all',
      state: 'all',
    }) ?? [];
    workspace.backlogStatus = 'loaded';
  } catch (error) {
    workspace.backlogStatus = 'error';
    workspace.backlogError = error instanceof Error ? error.message : String(error);
  }
}

async function createRepositoryIssue(agentId: string, description: string): Promise<WorkItem> {
  const repositoryId = props.snapshot.agentGitStatuses[agentId]?.githubRepository?.trim();
  if (!repositoryId) throw new Error('This repository is not connected to GitHub.');
  const item = await props.createWorkItem({
    agentId,
    provider: 'github',
    repositoryId,
    description,
  });
  const workspace = rightWorkspaceFor(agentId);
  workspace.backlogItems = [item, ...workspace.backlogItems.filter((candidate) => candidate.id !== item.id)];
  workspace.backlogStatus = 'loaded';
  workspace.backlogError = null;
  return item;
}

async function startRepositoryWork(agentId: string, input: RepositoryWorkStartInput): Promise<void> {
  const sourceAgent = props.snapshot.agents.find((agent) => agent.id === agentId);
  if (!sourceAgent) throw new Error('The selected agent is unavailable.');

  let workItem = input.item;
  if (workItem.kind === 'pullRequest' && !workItem.branchName?.trim()) {
    const refreshedItems = await props.loadWorkItems(workItem.provider, workItem.repositoryId, undefined, {
      kind: 'pullRequest',
      state: 'all',
    });
    workItem = refreshedItems?.find((candidate) => candidate.id === workItem.id)
      ?? workItem;
  }

  const targetLabel = input.target === 'duplicate' ? `a duplicate of ${sourceAgent.name}` : sourceAgent.name;
  if (!await confirmAssignedWorkItemOverride(workItem, targetLabel, input.target === 'current' ? sourceAgent.id : undefined)) {
    throw new Error('Assignment cancelled.');
  }

  const targetAgent = input.target === 'duplicate'
    ? await props.duplicateAgentAction(sourceAgent.id, { select: false })
    : sourceAgent;
  if (!targetAgent) throw new Error('The duplicate agent could not be created.');

  if (input.target === 'duplicate' && input.workspace.kind !== 'worktree') {
    throw new Error('A duplicated agent requires a new worktree.');
  }

  const pullRequestBranch = workItem.kind === 'pullRequest' ? workItem.branchName?.trim() : undefined;
  if (workItem.kind === 'pullRequest' && !pullRequestBranch) {
    throw new Error('GitHub did not return the pull request branch.');
  }

  const checkoutBranch = pullRequestBranch
    ?? (input.workspace.kind === 'worktree' ? input.workspace.branchName : undefined);
  if (checkoutBranch) {
    await props.createAgentGitBranch(targetAgent.id, {
      name: checkoutBranch,
      createWorktree: input.workspace.kind === 'worktree',
      ...(workItem.kind === 'pullRequest' ? { pullRequestNumber: workItem.number } : {}),
      confirmed: true,
    });
  }
  await props.assignWorkItemAction({
    agentId: targetAgent.id,
    item: workItem,
    prompt: workItemAssignmentPrompt(workItem, { action: input.action }),
  });
}

function prefillRepositoryWork(agentId: string, item: WorkItem): void {
  const prompt = workItemComposerPrompt(item);
  const existingText = props.composerState.text.trimEnd();
  const text = existingText ? `${existingText}\n\n${prompt}` : prompt;
  emit('update:composerState', {
    agentId,
    state: {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    },
  });
  void nextTick(() => conversationPane.value?.focusComposer());
}

function toggleFileExplorer(agentId: string): void {
  const workspace = rightWorkspaceFor(agentId);
  workspace.filesPaneOpen = !workspace.filesPaneOpen;
}

function selectRightWorkspaceTab(agentId: string, tab: RightWorkspaceTab): void {
  const workspace = rightWorkspaceFor(agentId);
  if (workspace.tabs.includes(tab)) {
    workspace.activeTab = tab;
  }
}

function closeRightWorkspaceTab(agentId: string, tab: RightWorkspaceTab): void {
  const workspace = rightWorkspaceFor(agentId);
  const tabIndex = workspace.tabs.indexOf(tab);
  if (tabIndex === -1) {
    return;
  }

  const nextTabs = workspace.tabs.filter((candidate) => candidate !== tab);
  workspace.tabs = nextTabs;
  if (tab === 'review') {
    workspace.gitReviewPanel = null;
  }
  if (tab === 'plan') {
    workspace.planPanel = null;
  }
  if (tab === 'files') {
    workspace.filesPaneOpen = false;
  }
  if (isRightWorkspaceFileTab(tab)) {
    const { [tab]: _closedPanel, ...filePanels } = workspace.filePanels;
    const { [tab]: _closedRequest, ...filePreviewRequestIds } = workspace.filePreviewRequestIds;
    workspace.filePanels = filePanels;
    workspace.filePreviewRequestIds = filePreviewRequestIds;
  }
  if (isRightWorkspaceDiffTab(tab)) {
    const { [tab]: _closedPanel, ...diffPanels } = workspace.diffPanels;
    workspace.diffPanels = diffPanels;
  }
  if (isRightWorkspaceImageTab(tab)) {
    const { [tab]: _closedPanel, ...imagePanels } = workspace.imagePanels;
    workspace.imagePanels = imagePanels;
  }
  if (workspace.activeTab === tab) {
    workspace.activeTab = nextTabs[Math.min(tabIndex, nextTabs.length - 1)] ?? null;
  }
  if (nextTabs.length === 0) {
    workspace.activeTab = null;
    workspace.open = false;
  }
}

function startRightWorkspaceResize(event: PointerEvent): void {
  event.preventDefault();
  const body = workspaceBody.value;
  if (!body) return;
  const agentId = currentAgent.value?.id;
  if (!agentId) return;
  const updateWidth = (moveEvent: PointerEvent) => {
    const availableWidth = Math.max(240, body.getBoundingClientRect().width - 240);
    rightWorkspaceFor(agentId).width = Math.min(Math.max(body.getBoundingClientRect().right - moveEvent.clientX, 240), availableWidth);
  };
  const stop = () => {
    window.removeEventListener('pointermove', updateWidth);
    window.removeEventListener('pointerup', stop);
  };
  window.addEventListener('pointermove', updateWidth);
  window.addEventListener('pointerup', stop, { once: true });
}

function openNewAgent(teamId?: string): void {
  agentDialogMode.value = 'create';
  editingAgentId.value = null;
  agentDialogTeamId.value = teamId ?? activeTeam.value?.id ?? null;
  agentDialogVisible.value = true;
}

async function openNewAgentForWorkItem(intent: WorkItemAssignmentIntent): Promise<void> {
  if (!await confirmAssignedWorkItemOverride(intent.item, 'a new agent')) {
    return;
  }

  pendingNewAgentWorkItem.value = intent.item;
  openNewAgent(intent.teamId ?? activeTeam.value?.id ?? props.snapshot.activeTeamId ?? undefined);
}

async function openBenchAgentAssignmentDialog(intent: WorkItemAssignmentIntent): Promise<void> {
  if (!await confirmAssignedWorkItemOverride(intent.item, 'a Bench agent')) {
    return;
  }

  pendingBenchAgentWorkItem.value = intent.item;
  pendingBenchAgentTeamId.value = intent.teamId ?? null;
  benchAssignmentDialogVisible.value = true;
}

function workItemTeamName(item: WorkItem): string {
  return `${workProviderTitle(item.provider)} #${item.number}`;
}

function workProviderTitle(provider: WorkItem['provider']): string {
  return provider === 'github' ? 'GitHub' : provider;
}

async function assignExistingAgentWorkItem(payload: { agentId: string; item: WorkItem }): Promise<void> {
  const targetAgent = props.snapshot.agents.find((agent) => agent.id === payload.agentId);
  if (!await confirmAssignedWorkItemOverride(payload.item, targetAgent?.name ?? 'this agent', payload.agentId)) {
    return;
  }

  emit('assign-work-item', payload);
}

async function confirmAssignedWorkItemOverride(item: WorkItem, targetLabel: string, targetAgentId?: string): Promise<boolean> {
  const assignedAgent = assignedAgentForWorkItem(item);
  if (!assignedAgent || assignedAgent.id === targetAgentId) {
    return true;
  }

  try {
    await ElMessageBox.confirm(
      `${workProviderTitle(item.provider)} #${item.number} is already assigned to ${assignedAgent.name}. We don't know if ${assignedAgent.name} is still working on it. Assign it to ${targetLabel} anyway?`,
      'Assign anyway?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Assign Anyway',
        type: 'warning',
      },
    );
    return true;
  } catch {
    return false;
  }
}

function assignedAgentForWorkItem(item: WorkItem): Agent | null {
  return findAssignedAgentForWorkItem(props.snapshot.agents, props.snapshot.workBacklog.assignments, item);
}

function openNewTeam(): void {
  teamDialogMode.value = 'create';
  editingTeamId.value = null;
  teamDialogVisible.value = true;
}

function openEditTeam(teamId: string): void {
  teamDialogMode.value = 'edit';
  editingTeamId.value = teamId;
  teamDialogVisible.value = true;
}

async function loadRemoteTeams(connectionId: string): Promise<Team[]> {
  const remoteSnapshot = await props.getLoopSnapshot?.({ kind: 'remote', remoteConnectionId: connectionId });
  return remoteSnapshot?.teams ?? [];
}

function openEditAgent(agentId: string): void {
  agentDialogMode.value = 'edit';
  editingAgentId.value = agentId;
  agentDialogTeamId.value = null;
  agentDialogVisible.value = true;
}

function closeAgentDialog(): void {
  agentDialogVisible.value = false;
  editingAgentId.value = null;
  agentDialogTeamId.value = null;
  pendingNewAgentWorkItem.value = null;
}

async function createAgentFromDialog(input: CreateAgentInput & { newTeamName?: string; teamId?: string }): Promise<void> {
  const { newTeamName, ...agentInput } = input;
  const targetTeamId = agentDialogMode.value === 'create'
    ? await resolveSelectedTeam(input.teamId ?? agentDialogTeamId.value, newTeamName)
    : null;
  const agent = await props.createAgent(targetTeamId ? { ...agentInput, teamId: targetTeamId } : agentInput);
  if (agent && pendingNewAgentWorkItem.value) {
    emit('assign-work-item', {
      agentId: agent.id,
      item: pendingNewAgentWorkItem.value,
    });
  }
  pendingNewAgentWorkItem.value = null;
}

function closeBenchAssignmentDialog(): void {
  benchAssignmentDialogVisible.value = false;
  pendingBenchAgentWorkItem.value = null;
  pendingBenchAgentTeamId.value = null;
}

async function assignWorkItemToBenchAgent(input: { benchTemplateId?: string; newTeamName?: string; teamId?: string }): Promise<void> {
  const item = pendingBenchAgentWorkItem.value;
  if (!item || !input.benchTemplateId) {
    return;
  }

  const targetTeamId = await resolveSelectedTeam(input.teamId ?? null, input.newTeamName);
  const agent = await props.deployBenchTemplateAction({
    templateId: input.benchTemplateId,
    ...(targetTeamId ? { teamId: targetTeamId } : {}),
  });
  if (agent) {
    emit('assign-work-item', {
      agentId: agent.id,
      item,
    });
  }
  closeBenchAssignmentDialog();
}

async function resolveSelectedTeam(teamId: string | null | undefined, newTeamName?: string): Promise<string | null> {
  const trimmedNewTeamName = newTeamName?.trim() ?? '';
  if (trimmedNewTeamName) {
    const team = await props.createTeam({
      name: trimmedNewTeamName,
      color: defaultTeamColor,
    });
    return team?.id ?? props.snapshot.activeTeamId ?? null;
  }

  return teamId?.trim() || props.snapshot.activeTeamId;
}

function openCockpit(): void {
  activeSurface.value = 'cockpit';
}

function openLoops(): void {
  activeSurface.value = 'loops';
}

function openSettings(): void {
  activeSurface.value = 'settings';
}

function openWhatsNew(): void {
  whatsNewVisible.value = true;
}

function openAttachmentImageAnnotation(attachment: CodexNativeAttachment): void {
  const agentId = currentAgent.value?.id;
  if (!agentId || attachment.type !== 'image') return;
  if (!attachment.previewUrl) {
    ElMessage.error('This image cannot be opened for annotation.');
    return;
  }
  debugImageAnnotationVisible.value = false;
  attachmentAnnotationTarget.value = { agentId, attachment };
}

function closeImageAnnotation(): void {
  debugImageAnnotationVisible.value = false;
  attachmentAnnotationTarget.value = null;
}

function handleImageAnnotationError(): void {
  if (attachmentAnnotationTarget.value) {
    ElMessage.error('This image cannot be opened for annotation.');
    closeImageAnnotation();
    return;
  }
  void useDebugAnnotationFallback();
}

function saveImageAnnotation(payload: ImageAnnotationSavePayload): void {
  const target = attachmentAnnotationTarget.value;
  if (!target) {
    debugImageAnnotationVisible.value = false;
    return;
  }

  if (payload.annotations.length === 0) {
    removeSavedImageAnnotations(target.agentId, target.attachment.reference);
  } else {
    attachmentAnnotationsByAgentId[target.agentId] = {
      ...attachmentAnnotationsByAgentId[target.agentId],
      [target.attachment.reference]: cloneSavedImageAnnotations(payload),
    };
  }
  attachmentAnnotationTarget.value = null;
}

function removeSavedImageAnnotations(agentId: string, reference: string): void {
  const existing = attachmentAnnotationsByAgentId[agentId];
  if (!existing?.[reference]) return;
  const next = { ...existing };
  delete next[reference];
  attachmentAnnotationsByAgentId[agentId] = next;
}

function cloneSavedImageAnnotations(draft: SavedImageAnnotations): SavedImageAnnotations {
  return {
    ...draft,
    annotations: draft.annotations.map((annotation) => ({
      ...annotation,
      start: { ...annotation.start },
      end: { ...annotation.end },
    })),
  };
}

async function openDebugImageAnnotation(imageDataUrl?: string, pixelRatio: 1 | 2 = 1): Promise<void> {
  attachmentAnnotationTarget.value = null;
  if (imageDataUrl) {
    debugAnnotationImageSource.value = imageDataUrl;
    debugAnnotationPixelRatio.value = pixelRatio;
    debugImageAnnotationVisible.value = true;
    return;
  }

  await useDebugAnnotationFallback();
  debugImageAnnotationVisible.value = true;
}

async function useDebugAnnotationFallback(): Promise<void> {
  debugAnnotationPixelRatio.value = 1;
  try {
    debugAnnotationImageSource.value = await centeredImageCropDataUrl(debugAnnotationScreenshotUrl);
  } catch {
    debugAnnotationImageSource.value = debugAnnotationScreenshotUrl;
  }
}

function imageDataUrlArrayBuffer(dataUrl: string): ArrayBuffer {
  const separator = dataUrl.indexOf(',');
  const header = separator >= 0 ? dataUrl.slice(0, separator) : '';
  if (!header.startsWith('data:image/png;') || !header.endsWith(';base64')) {
    throw new TypeError('Annotated image must be a base64 PNG data URL.');
  }
  const binary = atob(dataUrl.slice(separator + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function createLoop(input: CreateLoopInput, location?: LoopLocation): Promise<AppSnapshot | void> {
  return props.createLoop(input, location);
}

async function updateLoop(input: UpdateLoopInput, location?: LoopLocation): Promise<AppSnapshot | void> {
  return props.updateLoop(input, location);
}

async function runLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
  return props.runLoop(loopId, location);
}

async function clearLoopHistory(loopId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
  return props.clearLoopHistory(loopId, location);
}

async function deleteLoopExecution(loopId: string, executionId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
  return props.deleteLoopExecution(loopId, executionId, location);
}

async function deleteLoop(loopId: string, location?: LoopLocation): Promise<AppSnapshot | void> {
  return props.deleteLoop(loopId, location);
}

async function readConversationMessages(ref: BackendConversationRef, agentId: string, location?: LoopLocation): Promise<RendererMessage[]> {
  return location
    ? props.readConversationMessages(ref, agentId, location)
    : props.readConversationMessages(ref, agentId);
}

async function listAgentConversations(agentId: string): Promise<ConversationSummary[]> {
  return props.listAgentConversations(agentId);
}

async function resumeAgentConversation(agentId: string, ref: BackendConversationRef): Promise<void> {
  await props.resumeAgentConversation(agentId, ref);
}

function selectTeamFromRail(teamId: string): void {
  activeSurface.value = 'agent';
  emit('select-team', teamId);
}

function selectAgentFromShell(agentId: string): void {
  activeSurface.value = 'agent';
  emit('select-agent', agentId);
}

function selectAgentFromCockpit(payload: { agentId: string; teamId: string }): void {
  activeSurface.value = 'agent';
  emit('select-team', payload.teamId);
  emit('select-agent', payload.agentId);
}

function deployBenchTemplateForActiveTeam(templateId: string): void {
  emit('deploy-bench-template', {
    templateId,
    ...(activeTeam.value?.id ? { teamId: activeTeam.value.id } : {}),
  });
}

function removeBenchTemplateForActiveTeam(templateId: string): void {
  removeBenchTemplateForTeam(templateId, activeTeam.value);
}

function removeBenchTemplateForTeam(templateId: string, team: Team | null | undefined): void {
  emit('remove-bench-template', {
    templateId,
    ...(team?.id ? { teamId: team.id } : {}),
  });
}

function confirmPlan(): void {
  emit('update:planMode', false);
  emit('sendPrompt', 'implement the plan');
}

function forwardApprovalResolution(
  approvalId: string,
  decision: BackendApprovalDecision,
  scope: BackendApprovalScope,
): void {
  if (debugApproval.value?.request.id === approvalId) {
    debugApproval.value = null;
    return;
  }
  emit('resolve-approval', approvalId, decision, scope);
}

function forwardPrompt(prompt: string, options?: RendererSendPromptOptions): void {
  if (options) {
    emit('sendPrompt', prompt, options);
  } else {
    emit('sendPrompt', prompt);
  }
}

function forwardSteerPrompt(prompt: string, options?: RendererSendPromptOptions): void {
  if (options) {
    emit('steerPrompt', prompt, options);
  } else {
    emit('steerPrompt', prompt);
  }
}

async function forwardCodexPrompt(prompt: string, options?: CodexRendererSendMessageOptions): Promise<void> {
  await forwardCodexPromptWithImageAnnotations(prompt, options, forwardPrompt);
}

async function forwardCodexSteerPrompt(prompt: string, options?: CodexRendererSendMessageOptions): Promise<void> {
  await forwardCodexPromptWithImageAnnotations(prompt, options, forwardSteerPrompt);
}

async function forwardCodexPromptWithImageAnnotations(
  prompt: string,
  options: CodexRendererSendMessageOptions | undefined,
  forward: (nextPrompt: string, nextOptions?: RendererSendPromptOptions) => void,
): Promise<void> {
  const agentId = currentAgent.value?.id;
  const savedByReference = agentId ? attachmentAnnotationsByAgentId[agentId] ?? {} : {};
  let imageNumber = 0;
  const annotatedImages = props.composerAttachments.flatMap((attachment) => {
    if (attachment.type !== 'image') return [];
    imageNumber += 1;
    const draft = savedByReference[attachment.reference];
    return draft?.annotations.length ? [{ attachment, draft: cloneSavedImageAnnotations(draft), imageNumber }] : [];
  });
  if (!agentId || annotatedImages.length === 0) {
    forward(prompt, promptOptions(options));
    return;
  }

  const nativeApi = getCodexNativeRendererApi();
  if (!nativeApi?.capabilities.attachments) {
    throw new Error('Annotated images cannot be prepared by this host.');
  }
  const composerState = { ...props.composerState };
  const composerAttachments = props.composerAttachments.map((attachment) => ({ ...attachment }));
  const savedDrafts = Object.fromEntries(
    Object.entries(savedByReference).map(([reference, draft]) => [reference, cloneSavedImageAnnotations(draft)]),
  );

  try {
    const ingested = await nativeApi.ingestAttachments(annotatedImages.map(({ draft }) => ({
      name: draft.fileName,
      mimeType: 'image/png',
      data: imageDataUrlArrayBuffer(draft.dataUrl),
    })));
    if (ingested.length !== annotatedImages.length) {
      throw new Error('One or more annotated images could not be prepared.');
    }
    const replacementReferences = new Map(annotatedImages.map(({ attachment }, index) => [
      attachment.reference,
      ingested[index]!.reference,
    ]));
    const submittedAttachments = options?.attachments ?? composerAttachments.map((attachment) => ({
      type: attachment.type,
      reference: attachment.reference,
    }));
    const nextOptions: CodexRendererSendMessageOptions = {
      ...options,
      attachments: submittedAttachments.map((attachment) => ({
        ...attachment,
        reference: replacementReferences.get(attachment.reference) ?? attachment.reference,
      })),
    };
    forward(formatImageAnnotationPrompt(annotatedImages.map(({ attachment, draft, imageNumber: number }) => ({
      annotations: draft.annotations,
      fileName: attachment.name,
      imageNumber: number,
    })), prompt), promptOptions(nextOptions));
  } catch (error) {
    attachmentAnnotationsByAgentId[agentId] = savedDrafts;
    emit('update:composerState', { agentId, state: composerState });
    emit('update:composerAttachments', { agentId, attachments: composerAttachments });
    throw error;
  }
}

function promptOptions(options?: CodexRendererSendMessageOptions): RendererSendPromptOptions | undefined {
  const attachments = options?.attachments?.map<RendererPromptAttachment>((attachment) => ({ ...attachment }));
  return attachments?.length ? { attachments } : undefined;
}

function openConversationLink(link: CodexConversationLink): void | Promise<void> {
  if (link.kind === 'external') {
    window.open(link.href, '_blank', 'noopener,noreferrer');
    return;
  }
  const context = link as CodexConversationLink & Partial<Pick<ConversationFileLink, 'turnId' | 'messageId' | 'itemId'>>;
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

function openConversationImage(image: CodexMessageImage, context?: CodexMessageImageContext): true {
  const agent = currentAgent.value;
  if (!agent) return true;

  const durablePath = image.path?.trim() || undefined;
  const messageIdentifier = context?.message.id ?? `message-${context?.index ?? 'unknown'}`;
  const tab = rightWorkspaceImageTab([
    messageIdentifier,
    image.kind,
    durablePath ?? image.src,
  ].join('\0'));
  const title = image.title?.trim()
    || image.name?.trim()
    || (durablePath ? fileBasename(durablePath) : '')
    || image.alt.trim()
    || 'Image';
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

function updateConversationComposerState(state: CodexComposerState): void {
  const agentId = currentAgent.value?.id;
  if (agentId) emit('update:composerState', { agentId, state });
}

function updateConversationAttachments(attachments: readonly CodexNativeAttachment[]): void {
  const agentId = currentAgent.value?.id;
  if (!agentId) return;
  pruneSavedImageAnnotations(agentId, attachments);
  emit('update:composerAttachments', { agentId, attachments });
}

function pruneSavedImageAnnotations(agentId: string, attachments: readonly CodexNativeAttachment[]): void {
  const existing = attachmentAnnotationsByAgentId[agentId];
  if (!existing) return;
  const references = new Set(attachments.map((attachment) => attachment.reference));
  const next = Object.fromEntries(Object.entries(existing).filter(([reference]) => references.has(reference)));
  attachmentAnnotationsByAgentId[agentId] = next;
}

function cancelPlanReview(agentId: string): void {
  emit('update:planMode', false);
  closeRightWorkspaceTab(agentId, 'plan');
}

function commentOnPlan(comments: PlanReviewComment[]): void {
  if (comments.length === 0) {
    return;
  }

  emit('sendPrompt', formatPlanCommentPrompt(comments));
}

async function openFilePreview(link: ConversationFileLink): Promise<void> {
  const agent = currentAgent.value;
  if (!agent) return;
  const filePath = link.filepath ?? link.path;
  if (link.action === 'edit') {
    if (link.turnId && openTurnDiffPreviewForAgent(agent.id, link.turnId, filePath)) {
      return;
    }
    await openAgentGitDiffPreview(agent.id);
    return;
  }
  await openFilePreviewForAgent(agent.id, filePath);
}

function openTurnDiffPreviewForAgent(agentId: string, turnId: string, filePath: string): boolean {
  const agent = props.snapshot.agents.find((candidate) => candidate.id === agentId);
  const relativePath = normalizePreviewFilePath(filePath, agent?.folder);
  const turnDiff = props.snapshot.turnGitDiffs[turnId]?.diff;
  if (!agent || !relativePath || !turnDiff) return false;

  const diff = diffForPath(turnDiff, relativePath);
  if (!diff) return false;

  const workspace = rightWorkspaceFor(agentId);
  const tab = rightWorkspaceDiffTab(turnId, relativePath);
  workspace.diffPanels = {
    ...workspace.diffPanels,
    [tab]: {
      kind: 'gitDiff',
      title: fileBasename(relativePath),
      subtitle: relativePath,
      diff,
      state: 'idle',
      error: null,
    },
  };
  openRightWorkspaceTab(tab, agentId);
  return true;
}

function diffForPath(diff: string, filePath: string): string | null {
  const targetPath = normalizePathSeparators(filePath).replace(/^\.\//u, '');
  const sections = diff.split(/(?=^diff --git )/mu).filter((section) => section.startsWith('diff --git '));
  return sections.find((section) => {
    const header = section.split('\n', 1)[0] ?? '';
    const separator = header.indexOf(' b/');
    if (separator < 0) return false;
    const beforePath = header.slice('diff --git a/'.length, separator);
    const afterPath = header.slice(separator + ' b/'.length);
    return [beforePath, afterPath].some((candidate) => (
      normalizePathSeparators(candidate).replace(/^[ab]\//u, '') === targetPath
    ));
  }) ?? null;
}

function handleFileActivity(activity: AgentFileActivity): void {
  const agent = props.snapshot.agents.find((candidate) => candidate.id === activity.agentId);
  const filePath = normalizePreviewFilePath(activity.path, agent?.folder);
  if (!agent || !filePath) return;

  const workspace = rightWorkspaceFor(agent.id);
  const tab = rightWorkspaceFileTab(filePath);

  if (activity.action === 'read' || activity.status !== 'completed' || !workspace.filePanels[tab]) return;

  void openFilePreviewForAgent(agent.id, filePath, false);
}

async function openFilePreviewForAgent(agentId: string, filePath: string, reveal = true): Promise<void> {
  const agent = props.snapshot.agents.find((candidate) => candidate.id === agentId);
  const trimmedPath = normalizePreviewFilePath(filePath, agent?.folder);
  if (!agent || !trimmedPath) return;

  const workspace = rightWorkspaceFor(agent.id);
  const tab = rightWorkspaceFileTab(trimmedPath);
  const requestId = filePreviewRequestId + 1;
  filePreviewRequestId = requestId;
  workspace.filePreviewRequestIds = { ...workspace.filePreviewRequestIds, [tab]: requestId };
  const existingContent = workspace.filePanels[tab]?.content ?? '';
  workspace.filePanels = {
    ...workspace.filePanels,
    [tab]: filePreviewPanel(trimmedPath, existingContent, 'loading', null),
  };
  if (reveal && workspace.activeTab === 'files' && workspace.tabs.includes('files')) {
    workspace.tabs = workspace.tabs
      .map((candidate) => candidate === 'files' ? tab : candidate)
      .filter((candidate, index, tabs) => tabs.indexOf(candidate) === index);
    workspace.activeTab = tab;
    workspace.open = true;
  } else if (reveal) {
    openRightWorkspaceTab(tab, agent.id);
  }

  try {
    const result = await props.previewAgentFile(agent.id, trimmedPath);
    if (workspace.filePreviewRequestIds[tab] !== requestId) {
      return;
    }
    if (result.kind === 'image' && result.dataUrl) {
      const imageTab = rightWorkspaceImageTab(`workspace:${result.path}`);
      workspace.imagePanels = {
        ...workspace.imagePanels,
        [imageTab]: {
          kind: 'image', title: fileBasename(result.path), subtitle: result.path,
          alt: result.path, path: result.path, src: result.dataUrl, mimeType: result.mimeType,
          state: 'idle', error: null,
        },
      };
      closeRightWorkspaceTab(agent.id, tab);
      openRightWorkspaceTab(imageTab, agent.id);
      return;
    }
    if (result.kind === 'text' && /\.(?:diff|patch)$/iu.test(result.path)) {
      const diffTab = rightWorkspaceDiffTab('workspace', result.path);
      workspace.diffPanels = {
        ...workspace.diffPanels,
        [diffTab]: {
          kind: 'gitDiff', title: fileBasename(result.path), subtitle: result.path,
          diff: result.content ?? '', state: 'idle', error: null,
        },
      };
      closeRightWorkspaceTab(agent.id, tab);
      openRightWorkspaceTab(diffTab, agent.id);
      return;
    }
    const unavailable = result.kind === 'tooLarge'
      ? `Preview unavailable: this file is ${formatFileSize(result.size)} and exceeds the preview limit.`
      : result.kind === 'binary'
        ? 'Preview unavailable: this is a binary or unsupported file.'
        : result.content ?? '';
    workspace.filePanels = {
      ...workspace.filePanels,
      [tab]: filePreviewPanel(result.path, unavailable, 'idle', null),
    };
  } catch (error) {
    if (workspace.filePreviewRequestIds[tab] !== requestId) {
      return;
    }
    workspace.filePanels = {
      ...workspace.filePanels,
      [tab]: filePreviewPanel(
        trimmedPath,
        existingContent,
        'error',
        error instanceof Error ? error.message : String(error),
      ),
    };
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function filePreviewPanel(
  filePath: string,
  content: string,
  state: 'idle' | 'loading' | 'error',
  error: string | null,
): RightWorkspaceFilePanel {
  const kind = isMarkdownPath(filePath) ? 'markdown' : 'source';
  return {
    kind,
    title: fileBasename(filePath),
    subtitle: filePath,
    content,
    ...(kind === 'source' ? { language: languageForFilePath(filePath) ?? null } : {}),
    state,
    error,
  } as RightWorkspaceFilePanel;
}

function isLocalAgent(agent: Agent): boolean {
  const team = props.snapshot.teams.find((candidate) => candidate.id === agent.teamId);
  return !team?.remoteConnectionId;
}

async function openAgentIn(
  agentId: string,
  application: OpenInApplication,
  filePath?: string,
): Promise<void> {
  try {
    await props.openAgentPath(agentId, application, filePath);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

async function openAgentGitDiffPreview(agentId = currentAgent.value?.id): Promise<void> {
  const agent = props.snapshot.agents.find((candidate) => candidate.id === agentId);
  if (!agent) {
    return;
  }

  const workspace = rightWorkspaceFor(agent.id);
  workspace.gitReviewPanel = {
    kind: 'gitDiff',
    title: 'Review',
    subtitle: agent.folder,
    diff: '',
    state: 'loading',
    error: null,
  };
  openRightWorkspaceTab('review', agent.id);
  try {
    await props.openAgentGitDiff(agent.id);
  } catch (error) {
    workspace.gitReviewPanel = {
      kind: 'gitDiff',
      title: 'Review',
      subtitle: agent.folder,
      diff: '',
      state: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleShellShortcut(event: KeyboardEvent): void {
  if (showLoginLanding.value) {
    return;
  }
  if (isModalDialogVisible.value || !isAgentWorkspaceVisible.value) {
    return;
  }

  if (event.key === 'Meta') {
    startQuickAgentShortcutReveal(event);
    return;
  }

  if (event.metaKey) {
    resetQuickAgentShortcuts();
  }

  if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'p' && currentAgent.value) {
    event.preventDefault();
    fileQuickOpenVisible.value = true;
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
    const agent = activeTeamAgents.value[Number(event.key) - 1];
    if (agent) {
      event.preventDefault();
      selectAgentFromShell(agent.id);
    }
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'g' && currentAgent.value) {
    event.preventDefault();
    void openAgentGitDiffPreview();
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b' && currentAgent.value) {
    if (!clawHostCapabilities.embeddedBrowser) return;
    event.preventDefault();
    openRightWorkspaceTab('browser');
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'd') {
    duplicateActiveAgent(event);
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    restartActiveAgent();
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'w') {
    closeActiveAgent(event);
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && (event.key === '`' || event.code === 'Backquote')) {
    if (cycleTeams()) {
      event.preventDefault();
    }
    return;
  }

  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab') {
    cycleAgents(event.shiftKey ? -1 : 1, event);
  }
}

function startQuickAgentShortcutReveal(event: KeyboardEvent): void {
  commandKeyHeld = true;
  if (event.repeat || quickAgentShortcutTimer || quickAgentShortcutsVisible.value) {
    return;
  }
  quickAgentShortcutTimer = setTimeout(() => {
    quickAgentShortcutTimer = null;
    if (commandKeyHeld && !showLoginLanding.value && !isModalDialogVisible.value && isAgentWorkspaceVisible.value) {
      quickAgentShortcutsVisible.value = true;
    }
  }, quickAgentShortcutDelayMs);
}

function handleShellKeyup(event: KeyboardEvent): void {
  if (event.key === 'Meta' || !event.metaKey) {
    resetQuickAgentShortcuts();
  }
}

function resetQuickAgentShortcuts(): void {
  commandKeyHeld = false;
  quickAgentShortcutsVisible.value = false;
  if (quickAgentShortcutTimer) {
    clearTimeout(quickAgentShortcutTimer);
    quickAgentShortcutTimer = null;
  }
}

function handleAppCommand(command: AppCommand): void {
  // Native menu accelerators can consume the matching key event before the
  // renderer observes Meta keyup. Treat the resolved command as the end of
  // the transient Command-number reveal so the sidebar cannot stay latched.
  resetQuickAgentShortcuts();

  if (command.type === 'appshot-failed') {
    if (!clawHostCapabilities.appshots) return;
    ElMessage.error(command.message);
    return;
  }

  if (command.type === 'attach-appshot') {
    if (!clawHostCapabilities.appshots) return;
    void attachAppshot(command);
    return;
  }

  if (command.type === 'set-agent-list-compact') {
    void updateSettings({ general: { agentListCompact: command.compact } });
    return;
  }

  if (command.type === 'open-settings') {
    openSettings();
    return;
  }

  if (command.type === 'open-whats-new') {
    openWhatsNew();
    return;
  }

  if (command.type === 'open-browser' && command.agentId && command.url) {
    if (!clawHostCapabilities.embeddedBrowser) return;
    handleBrowserOpenCommand(command);
    return;
  }

  if (command.type === 'open-agent-composer') {
    const agent = command.agentId
      ? props.snapshot.agents.find((candidate) => candidate.id === command.agentId)
      : currentAgent.value;
    if (!agent) return;
    activeSurface.value = 'agent';
    emit('select-agent', agent.id);
    if (command.prompt !== undefined) {
      if (command.submit !== false) {
        emit('send-agent-prompt', { agentId: agent.id, prompt: command.prompt });
        return;
      }
      emit('update:composerState', {
        agentId: agent.id,
        state: {
          text: command.prompt,
          selectionStart: command.prompt.length,
          selectionEnd: command.prompt.length,
        },
      });
    }
    void nextTick(() => conversationPane.value?.focusComposer());
    return;
  }

  if (command.type === 'debug-open-markdown') {
    activeSurface.value = 'agent';
    openMarkdownRequest({
      kind: 'markdown',
      title: 'Debug Markdown',
      content: [
        '# Debug Markdown',
        '',
        'Opened from the Codex Claw Debug menu.',
        '',
        '## Rendering fixtures',
        '',
        '- [x] Workspace tab',
        '- [ ] Markdown content',
        '',
        '> A deterministic document for checking Markdown presentation.',
        '',
        '```ts',
        "const source = 'Debug menu';",
        '```',
      ].join('\n'),
    });
    return;
  }

  if (command.type === 'debug-approval-request') {
    const agent = currentAgent.value;
    if (!agent) return;
    activeSurface.value = 'agent';
    debugApproval.value = {
      agentId: agent.id,
      request: {
        id: 'debug-approval-request',
        kind: 'command',
        conversationId: `debug-${agent.id}`,
        itemId: 'debug-command-item',
        title: 'Allow debug command',
        description: 'A deterministic approval request from the Debug menu.',
        command: 'npm test -- --run debug-fixture',
        cwd: agent.folder,
        allowedScopes: ['once', 'session'],
        canDeny: true,
      },
    };
    return;
  }

  if (command.type === 'debug-mark-unread') {
    emit('debug-mark-unread');
    return;
  }

  if (command.type === 'debug-image-annotation') {
    if (isModalDialogVisible.value) return;
    void openDebugImageAnnotation(command.imageDataUrl, command.pixelRatio);
    return;
  }

  if (isModalDialogVisible.value) {
    return;
  }

  if (command.type === 'quit') {
    if (!clawHostCapabilities.appLifecycle) return;
    void quit();
    return;
  }

  if (command.type === 'cycle-teams') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    cycleTeams();
    return;
  }

  if (command.type === 'open-review') {
    if (isAgentWorkspaceVisible.value && currentAgent.value) {
      void openAgentGitDiffPreview();
    }
    return;
  }

  if (command.type === 'open-browser') {
    if (!clawHostCapabilities.embeddedBrowser) return;
    if (isAgentWorkspaceVisible.value && currentAgent.value) {
      handleBrowserOpenCommand(command);
    }
    return;
  }

  if (command.type === 'new-team') {
    openNewTeam();
    return;
  }

  if (command.type === 'new-agent') {
    openNewAgent();
    return;
  }

  if (command.type === 'close-active-agent') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    closeActiveAgent();
    return;
  }

  if (command.type === 'close-active-team') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    void closeActiveTeam();
    return;
  }

  if (command.type === 'cycle-agents') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    cycleAgents(command.direction);
    return;
  }

  if (command.type === 'edit-active-agent') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    editActiveAgent();
    return;
  }

  if (command.type === 'duplicate-active-agent') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    duplicateActiveAgent();
    return;
  }

  if (command.type === 'restart-active-agent') {
    if (!isAgentWorkspaceVisible.value) {
      return;
    }
    restartActiveAgent();
  }
}

async function attachAppshot(command: Extract<AppCommand, { type: 'attach-appshot' }>): Promise<void> {
  const agent = currentAgent.value;
  const nativeApi = getCodexNativeRendererApi();
  if (!agent || !nativeApi || !props.backendCapabilities.attachments) {
    ElMessage.error('Select an agent that supports image attachments before taking an Appshot.');
    return;
  }

  try {
    const [attachment] = await nativeApi.ingestAttachments([{
      name: appshotFileName(command.appName),
      mimeType: 'image/png',
      data: imageDataUrlArrayBuffer(command.imageDataUrl),
    }]);
    if (!attachment) throw new Error('Appshot ingestion returned no attachment.');
    activeSurface.value = 'agent';
    emit('update:composerAttachments', {
      agentId: agent.id,
      attachments: [...props.composerAttachments, attachment],
    });
    await nextTick();
    conversationPane.value?.focusComposer();
  } catch {
    ElMessage.error('The Appshot could not be attached.');
  }
}

function appshotFileName(appName?: string): string {
  const source = appName?.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${source ? `${source}-` : ''}appshot-${Date.now()}.png`;
}

async function updateSettings(input: UpdateSettingsInput): Promise<void> {
  await props.updateSettings(input);
}

async function setCodexResourceSharing(input: SetCodexResourceSharingInput): Promise<void> {
  await props.setCodexResourceSharing(input);
}

async function migrateCodexResources(): Promise<void> {
  if (codexResourceSharingBlocked.value || codexResourceSharingMigrationPending.value) return;
  codexResourceSharingMigrationPending.value = true;
  try {
    await setCodexResourceSharing({ enabled: true });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    codexResourceSharingMigrationPending.value = false;
  }
}

async function declineCodexResourceSharingMigration(): Promise<void> {
  if (codexResourceSharingMigrationPending.value) return;
  codexResourceSharingMigrationPending.value = true;
  try {
    await setCodexResourceSharing({ enabled: false, mode: 'keep' });
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    codexResourceSharingMigrationPending.value = false;
  }
}

async function getPluginStatus(): Promise<import('@codex-claw/core/contracts').AppPluginStatus> {
  return props.getPluginStatus();
}

async function setDaemonEnabled(enabled: boolean): Promise<void> {
  await props.setDaemonEnabled(enabled);
}

async function restartApp(): Promise<void> {
  await props.restartApp();
}

async function connectWorkProvider(provider: WorkProviderKind): Promise<void> {
  await props.connectWorkProvider(provider);
}

async function completeWorkProviderConnection(provider: WorkProviderKind): Promise<void> {
  await props.completeWorkProviderConnection(provider);
}

async function disconnectWorkProvider(provider: WorkProviderKind): Promise<void> {
  await props.disconnectWorkProvider(provider);
}

async function selectWorkRepositoryForCockpit(repositoryId: string | null): Promise<void> {
  await configureCockpitWorkBacklog({
    repositoryId,
    assigneeLogin: null,
    tagName: null,
  });
  if (repositoryId) {
    await props.loadWorkItems('github', repositoryId);
  }
}

async function selectWorkAssigneeForCockpit(assigneeLogin: string | null): Promise<void> {
  const repositoryId = cockpitWorkBacklog.value?.selectedRepositoryId ?? null;
  await configureCockpitWorkBacklog({
    repositoryId,
    assigneeLogin,
    tagName: cockpitWorkBacklog.value?.selectedTagName ?? null,
  });
}

async function selectWorkTagForCockpit(tagName: string | null): Promise<void> {
  const repositoryId = cockpitWorkBacklog.value?.selectedRepositoryId ?? null;
  await configureCockpitWorkBacklog({
    repositoryId,
    assigneeLogin: cockpitWorkBacklog.value?.selectedAssigneeLogin ?? null,
    tagName,
  });
}

async function configureCockpitWorkBacklog(configuration: CockpitBacklogConfiguration): Promise<void> {
  const normalized = normalizedCockpitBacklogConfiguration(configuration);
  pendingCockpitBacklogConfiguration.value = normalized;
  try {
    await props.configureWorkBacklog({
      provider: 'github',
      configuration: normalized,
    });
  } catch (error) {
    if (pendingCockpitBacklogConfiguration.value && sameCockpitBacklogConfiguration(pendingCockpitBacklogConfiguration.value, normalized)) {
      pendingCockpitBacklogConfiguration.value = null;
    }
    throw error;
  }
}

function normalizedCockpitBacklogConfiguration(configuration: CockpitBacklogConfiguration): CockpitBacklogConfiguration {
  return {
    repositoryId: normalizedOptionalString(configuration.repositoryId),
    assigneeLogin: normalizedOptionalString(configuration.assigneeLogin),
    tagName: normalizedOptionalString(configuration.tagName),
  };
}

function sameCockpitBacklogConfiguration(left: CockpitBacklogConfiguration, right: CockpitBacklogConfiguration): boolean {
  return left.repositoryId === right.repositoryId &&
    left.assigneeLogin === right.assigneeLogin &&
    left.tagName === right.tagName;
}

function normalizedOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function refreshWorkItems(repositoryId: string | null): Promise<void> {
  if (repositoryId) {
    await props.loadWorkItems('github', repositoryId);
  } else {
    await props.loadWorkRepositories('github');
  }
}

async function quit(): Promise<void> {
  await props.quit();
}

function duplicateActiveAgent(event?: KeyboardEvent): void {
  const agent = currentAgent.value;
  if (!agent) {
    return;
  }

  event?.preventDefault();
  emit('duplicate-agent', agent.id);
}

function closeActiveAgent(event?: KeyboardEvent): void {
  const agent = currentAgent.value;
  if (!agent) {
    return;
  }

  event?.preventDefault();
  emit('close-agent', agent.id);
}

async function closeActiveTeam(): Promise<void> {
  const team = activeTeam.value;
  if (!team || props.snapshot.teams.length <= 1) {
    return;
  }

  if (await confirmCloseTeam(team)) {
    emit('close-team', team.id);
  }
}

function restartActiveAgent(): void {
  const agent = currentAgent.value;
  if (!agent) {
    return;
  }

  emit('restart-agent', agent.id);
}

function editActiveAgent(): void {
  const agent = currentAgent.value;
  if (!agent) {
    return;
  }

  openEditAgent(agent.id);
}

function fileBasename(filePath: string): string {
  return filePath.split('/').filter(Boolean).at(-1) ?? filePath;
}

function isMarkdownPath(filePath: string): boolean {
  const normalizedPath = filePath.split('#')[0]?.split('?')[0]?.toLowerCase() ?? '';
  return /\.(md|markdown|mdown|mkdn)$/u.test(normalizedPath);
}

function normalizePreviewFilePath(filePath: string, agentFolder?: string): string {
  const trimmedPath = filePath.trim();
  if (!trimmedPath.startsWith('file://')) {
    return toBackendPreviewPath(stripPreviewLineSuffix(trimmedPath), agentFolder);
  }

  try {
    return toBackendPreviewPath(stripPreviewLineSuffix(decodeURIComponent(new URL(trimmedPath).pathname)), agentFolder);
  } catch {
    return toBackendPreviewPath(stripPreviewLineSuffix(trimmedPath), agentFolder);
  }
}

function stripPreviewLineSuffix(filePath: string): string {
  return filePath.replace(/:(?:\d+)(?::\d+)?$/u, '');
}

function toBackendPreviewPath(filePath: string, agentFolder?: string): string {
  const normalizedPath = normalizePathSeparators(filePath);
  if (!isAbsolutePreviewPath(normalizedPath)) {
    return normalizedPath;
  }

  const normalizedFolder = normalizePathSeparators(agentFolder ?? '').replace(/\/+$/u, '');
  if (!normalizedFolder || !isAbsolutePreviewPath(normalizedFolder)) {
    return normalizedPath;
  }

  if (!normalizedPath.startsWith(`${normalizedFolder}/`)) {
    return normalizedPath;
  }

  return normalizedPath.slice(normalizedFolder.length + 1);
}

function normalizePathSeparators(filePath: string): string {
  return filePath.replace(/\\/gu, '/');
}

function isAbsolutePreviewPath(filePath: string): boolean {
  return filePath.startsWith('/') || /^[a-z]:\//iu.test(filePath);
}

function workItemsKey(provider: WorkProviderKind, repositoryId: string): string {
  return `${provider}:${repositoryId}`;
}

function benchForTeam(team: Team | null | undefined): BenchTemplate[] {
  const location = benchLocationForTeam(team);
  if (!isRemoteBenchLocation(location)) {
    return props.snapshot.bench;
  }
  return props.remoteBenchByConnectionId[location.remoteConnectionId] ?? [];
}

function benchLocationForTeam(team: Team | null | undefined): BenchLocation {
  const remoteConnectionId = team?.remoteConnectionId?.trim() ?? '';
  return remoteConnectionId ? { kind: 'remote', remoteConnectionId } : { kind: 'local' };
}

function isRemoteBenchLocation(location: BenchLocation): location is Extract<BenchLocation, { kind: 'remote' }> {
  return location.kind === 'remote' && location.remoteConnectionId.trim().length > 0;
}

function loadVisibleBenchCatalogs(): void {
  const teams = cockpitVisible.value || benchAssignmentDialogVisible.value
    ? props.snapshot.teams
    : activeTeam.value ? [activeTeam.value] : [];
  for (const team of teams) {
    loadBenchForTeam(team);
  }
}

function loadBenchForTeam(team: Team): void {
  const location = benchLocationForTeam(team);
  if (!isRemoteBenchLocation(location)) {
    return;
  }

  const status = props.remoteBenchStatusByConnectionId[location.remoteConnectionId] ?? 'notLoaded';
  if (status === 'loading' || status === 'loaded') {
    return;
  }

  void props.loadBench(location);
}

function cycleTeams(): boolean {
  const teams = props.snapshot.teams;
  if (teams.length < 2) {
    return false;
  }

  const activeIndex = Math.max(teams.findIndex((team) => team.id === activeTeam.value?.id), 0);
  const nextTeam = teams[(activeIndex + 1) % teams.length];
  if (!nextTeam) {
    return false;
  }

  selectTeamFromRail(nextTeam.id);
  return true;
}

function cycleAgents(direction: 1 | -1, event?: KeyboardEvent): void {
  const agents = activeTeamAgents.value;
  if (agents.length < 2) {
    return;
  }

  const activeIndex = Math.max(agents.findIndex((agent) => agent.id === currentAgent.value?.id), 0);
  const nextAgent = agents[(activeIndex + direction + agents.length) % agents.length];
  if (!nextAgent) {
    return;
  }

  event?.preventDefault();
  selectAgentFromShell(nextAgent.id);
}

const activeTeamName = computed(() => activeTeam.value?.name ?? 'Codex Claw');
const activeBench = computed(() => benchForTeam(activeTeam.value));
const benchByTeamId = computed<Record<string, BenchTemplate[]>>(() => {
  const next: Record<string, BenchTemplate[]> = {};
  for (const team of props.snapshot.teams) {
    next[team.id] = benchForTeam(team);
  }
  return next;
});

watch(() => [
  activeTeam.value?.id ?? '',
  activeTeam.value?.remoteConnectionId ?? '',
  cockpitVisible.value ? 'cockpit' : '',
  benchAssignmentDialogVisible.value ? 'bench-dialog' : '',
  props.snapshot.teams.map((team) => `${team.id}:${team.remoteConnectionId ?? ''}`).join('\0'),
], () => {
  loadVisibleBenchCatalogs();
}, { immediate: true });

watch(() => props.sidePanelRequest, (request) => {
  if (!request) {
    return;
  }

  openSidePanelRequest(request);
}, { immediate: true });

watch(() => props.fileActivity, (activity) => {
  if (activity) handleFileActivity(activity);
});

function openSidePanelRequest(request: SidePanelRequest): void {
  if (request.kind === 'markdown') {
    openMarkdownRequest(request);
    return;
  }

  openGitDiffRequest(request);
}

function openMarkdownRequest(request: SidePanelMarkdownRequest): void {
  const agent = currentAgent.value;
  if (!agent) return;
  if (request.purpose !== 'plan') {
    const identifier = request.path ?? `inline-${++markdownPreviewId}`;
    const tab = request.path ? rightWorkspaceFileTab(request.path) : rightWorkspaceMarkdownTab(identifier);
    const subtitle = request.path;
    const workspace = rightWorkspaceFor(agent.id);
    workspace.filePanels = {
      ...workspace.filePanels,
      [tab]: {
        kind: 'markdown',
        title: request.title ?? (subtitle ? fileBasename(subtitle) : 'Markdown'),
        ...(subtitle ? { subtitle } : {}),
        content: request.content,
        state: 'idle',
        error: null,
      },
    };
    openRightWorkspaceTab(tab, agent.id);
    return;
  }

  const subtitle = request.path;
  rightWorkspaceFor(agent.id).planPanel = {
    kind: 'markdown',
    purpose: 'plan',
    title: request.title ?? (subtitle ? fileBasename(subtitle) : 'Markdown'),
    ...(subtitle ? { subtitle } : {}),
    content: request.content,
    state: 'idle',
    error: null,
  };
  openRightWorkspaceTab('plan', agent.id);
}

function openGitDiffRequest(request: Extract<SidePanelRequest, { kind: 'gitDiff' }>): void {
  if (request.scope === 'turn') {
    return;
  }

  const agentId = currentAgent.value?.id;
  if (!agentId) return;
  rightWorkspaceFor(agentId).gitReviewPanel = {
    kind: 'gitDiff',
    title: request.title ?? 'Review',
    ...(request.subtitle ? { subtitle: request.subtitle } : {}),
    diff: request.diff,
    ...(request.sections ? { sections: request.sections } : {}),
    state: request.state ?? 'idle',
    error: request.error ?? null,
  };
  openRightWorkspaceTab('review', agentId);
}

function formatPlanCommentPrompt(comments: PlanReviewComment[]): string {
  const formattedComments = comments.map((comment, index) => [
    `${index + 1}. On: "${comment.quote}"`,
    `   Comment: ${comment.body}`,
  ].join('\n')).join('\n\n');

  return [
    'Refine the plan using these comments:',
    '',
    formattedComments,
  ].join('\n');
}
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-shell-window);
}

.app-shell--auth-gated > :not(.codex-login) {
  visibility: hidden;
}

.app-shell > .agent-sidebar-enter-active,
.app-shell > .agent-sidebar-leave-active {
  overflow: hidden;
  transition:
    flex-basis 180ms ease,
    width 180ms ease,
    min-width 180ms ease,
    max-width 180ms ease,
    opacity 140ms ease,
    transform 180ms ease;
}

.app-shell > .agent-sidebar-enter-from,
.app-shell > .agent-sidebar-leave-to {
  flex-basis: 0;
  width: 0;
  min-width: 0;
  max-width: 0;
  opacity: 0;
  transform: translateX(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .app-shell > .agent-sidebar-enter-active,
  .app-shell > .agent-sidebar-leave-active {
    transition-duration: 1ms;
  }
}

.app-shell__content {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: visible;
  background: var(--color-shell-main);
}

.app-shell__connection-status {
  position: relative;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 5px 14px;
  border-bottom: 1px solid var(--color-outline-subtle);
  background: var(--color-surface-low);
  color: var(--color-text-muted);
  font-size: 12px;
}

.app-shell__connection-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--color-warning);
}

.app-shell__connection-status--error .app-shell__connection-status-dot {
  background: var(--color-error);
}

.app-shell__connection-status-detail {
  min-width: 0;
  overflow: hidden;
  opacity: 0.78;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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
  content: "";
  position: absolute;
  inset: 0 auto 0 2px;
  width: 1px;
  background: var(--color-border);
}

.app-shell__right-workspace-resizer:hover::after {
  background: var(--color-border-strong);
}
</style>
