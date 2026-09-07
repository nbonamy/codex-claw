<template>
  <main
    class="app-shell"
    :class="{ 'app-shell--auth-gated': showOnboardingGate }"
  >
    <FirstRunOnboardingGate
      :authentication="authentication"
      :authentication-cancelling="authenticationCancelling"
      :authentication-error="authenticationError"
      :authentication-loading="authenticationLoading"
      :github-onboarding-visible="githubOnboardingVisible"
      :initial-authentication-loading="initialAuthenticationLoading"
      :onboarding-complete-visible="onboardingCompleteVisible"
      :repository-acquire-busy="repositoryAcquireBusy"
      :repository-acquire-error="repositoryAcquireError"
      :show-login-landing="showLoginLanding"
      :snapshot="snapshot"
      :work-backlog-error="workBacklogError"
      :work-provider-authorization="workProviderAuthorization"
      @cancel="cancelChatGptLogin"
      @complete="completeGitHubOnboardingStep"
      @connect-github="connectGitHub"
      @finish="finishFirstRunOnboarding"
      @login="startChatGptLogin"
      @open-github-authorization="openGitHubAuthorization"
    />
    <AppShellNavigation
      :active-team="activeTeam"
      :active-team-agents="activeTeamAgents"
      :active-team-name="activeTeamName"
      :agent-list-compact="agentListCompact"
      :agent-sidebar-width="agentSidebarWidth"
      :authentication="authentication"
      :automations-visible="automationsVisible"
      :cockpit-visible="cockpitVisible"
      :current-agent="currentAgent"
      :forkable-agent-ids="forkableAgentIds"
      :list-repository-session-branches="listRepositorySessionBranches"
      :open-in-applications="openInApplications"
      :quick-agent-shortcuts-visible="quickAgentShortcutsVisible"
      :settings-visible="settingsVisible"
      :show-agent-sidebar="showAgentSidebar"
      :snapshot="snapshot"
      :unread-agent-ids="unreadAgentIds"
      :unread-team-ids="unreadTeamIds"
      @close-team="$emit('close-team', $event)"
      @close-agent="$emit('close-agent', $event)"
      @cleanup-pull-request="$emit('cleanup-pull-request', $event)"
      @collapse-sidebar="agentSidebarCollapsed = true"
      @create-agent-from-repository="openRepositorySessionSource"
      @create-agent-on-branch="createRepositorySessionOnBranch"
      @create-agent-worktree-in-repository="openRepositorySessionWorktree"
      @create-quick-chat="createQuickChat"
      @disconnect-team="$emit('disconnect-team', $event)"
      @duplicate-agent="$emit('duplicate-agent', $event)"
      @edit-agent="openEditAgent"
      @edit-team="openEditTeam"
      @fork-agent="$emit('fork-agent', $event)"
      @logout="logoutCodex"
      @move-agent-to-team="$emit('move-agent-to-team', $event)"
      @new-team="openNewTeam"
      @open-automations="openAutomations"
      @open-cockpit="openCockpit"
      @open-in="openAgentIn($event.agentId, $event.application)"
      @open-settings="openSettings"
      @open-whats-new="openWhatsNew"
      @quit="quit"
      @reorder-agents="$emit('reorder-agents', $event)"
      @reorder-repositories="$emit('reorder-repositories', $event)"
      @reorder-teams="$emit('reorder-teams', $event)"
      @resize-sidebar="setAgentSidebarWidth"
      @restart-agent="$emit('restart-agent', $event)"
      @resume-session="openResumeSession"
      @select-agent="selectAgentFromShell"
      @select-team="selectTeamFromRail"
      @start-work="handleStartWorkAction"
      @toggle-speech-mute="toggleSpokenAnnouncementsMuted"
      @update-collapsed-repositories="updateCollapsedRepositories"
      @update-repository-icon="updateRepositoryIcon"
    />
    <section class="app-shell__content">
      <BackendConnectionBanner :connection-state="connectionState" />
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
      <AutomationsView
        v-else-if="automationsVisible"
        :clear-automation-history="clearAutomationHistory"
        :create-automation="createAutomation"
        :delete-automation-execution="deleteAutomationExecution"
        :delete-automation="deleteAutomation"
        :get-automation-snapshot="getAutomationSnapshot"
        :load-work-repositories="loadWorkRepositories"
        :list-source-repositories="listSourceRepositories"
        :automations="snapshot.automations"
        :read-conversation-messages="readConversationMessages"
        :remote-connections="snapshot.remoteConnections.connections"
        :run-automation="runAutomation"
        :source-repositories="sourceRepositories"
        :teams="snapshot.teams"
        :update-automation="updateAutomation"
        :work-backlog="snapshot.workBacklog"
        :work-backlog-error="workBacklogError"
        :work-backlog-status="workBacklogStatus"
        :work-repositories-by-provider="workRepositoriesByProvider"
      />
      <CockpitView
        v-else-if="cockpitVisible"
        :agents="snapshot.agents"
        :forkable-agent-ids="forkableAgentIds"
        :default-team-id="snapshot.activeTeamId"
        :repository-icons="snapshot.general.repositoryIcons"
        :start-work-items-action="startCockpitWorkItems"
        :teams="snapshot.teams"
        :work-backlog="cockpitWorkBacklog"
        @add-agent="openNewAgent"
        @assign-work-item-to-new-agent="openNewAgentForWorkItem"
        @assign-work-item="assignExistingAgentWorkItem"
        @close-agent="$emit('close-agent', $event)"
        @duplicate-agent="$emit('duplicate-agent', $event)"
        @fork-agent="$emit('fork-agent', $event)"
        @edit-agent="openEditAgent"
        @move-agent-to-team="$emit('move-agent-to-team', $event)"
        @prompt-agent="$emit('send-agent-prompt', $event)"
        @refresh-work-items="refreshWorkItems"
        @change-work-items-page="changeGlobalWorkItemsPage"
        @select-global-scope="selectGlobalBacklogScope"
        @restart-agent="$emit('restart-agent', $event)"
        @select-work-tag="selectWorkTagForCockpit"
        @select-work-assignee="selectWorkAssigneeForCockpit"
        @select-work-repository="selectWorkRepositoryForCockpit"
        @select-agent="selectAgentFromCockpit"
        @select-team="selectTeamFromRail"
      />
      <AgentWorkspace
        v-else
        ref="agentWorkspace"
        :active-attachment-annotation-counts="activeAttachmentAnnotationCounts"
        :agent-files="agentFiles"
        :agent-sidebar-collapsed="agentSidebarCollapsed"
        :close-right-workspace-tab="closeRightWorkspaceTab"
        :commit-agent-git-changes="props.commitAgentGitChanges"
        :confirm-plan="confirmPlan"
        :conversation-pane-controller="conversationPaneController"
        :conversation-plan="conversationPlan"
        :create-agent-git-pull-request="props.createAgentGitPullRequest"
        :current-agent="currentAgent"
        :current-agent-git-status="currentAgentGitStatus"
        :current-backend-runtime="currentBackendRuntime"
        :forward-prompt="forwardPrompt"
        :generate-agent-git-message="props.generateAgentGitMessage"
        :get-agent-git-workflow="props.getAgentGitWorkflow"
        :handle-start-work-action="handleStartWorkAction"
        :is-agent-empty="isAgentEmpty"
        :is-conversation-loading="isConversationLoading"
        :history-load-failed="isConversationLoadFailed"
        :is-loading="isLoading"
        :is-modal-dialog-visible="isModalDialogVisible"
        :is-right-workspace-visible="isRightWorkspaceVisible"
        :has-visible-messages="conversationMessages.length > 0"
        :has-running-plan-tool="conversationHasRunningPlanTool"
        :latest-conversation-turn-id="conversationLatestTurnId"
        :load-work-items="props.loadWorkItems"
        :merge-agent-git-branch="props.mergeAgentGitBranch"
        :open-agent-git-diff-preview="openAgentGitDiffPreview"
        :open-agent-in="openAgentIn"
        :open-attachment-image-annotation="openAttachmentImageAnnotation"
        :open-file-preview="openFilePreview"
        :open-file-preview-for-agent="openFilePreviewForAgent"
        :open-in-applications="openInApplications"
        :open-right-workspace-tab="openRightWorkspaceTab"
        :prefill-work-item-for-agent="prefillWorkItemForAgent"
        :push-agent-git-branch="props.pushAgentGitBranch"
        :right-workspace-for="rightWorkspaceFor"
        :right-workspaces="rightWorkspaces"
        :right-workspace-visible="rightWorkspaceVisible"
        :read-conversation-messages="readConversationMessages"
        :retry-conversation-history="props.retryAgentHistory"
        :select-agent-from-shell="selectAgentFromShell"
        :select-right-workspace-tab="selectRightWorkspaceTab"
        :snapshot="snapshot"
        :start-repository-work="startRepositoryWork"
        :start-right-workspace-resize="startRightWorkspaceResize"
        :toggle-file-explorer="toggleFileExplorer"
        :toggle-right-workspace="toggleRightWorkspace"
        :update-status="updateStatus"
        @close-agent="$emit('close-agent', $event)"
        @expand-sidebar="agentSidebarCollapsed = false"
        @install-update="emit('install-update')"
        @remove-work-item-assignment="$emit('remove-work-item-assignment', $event)"
        @send-prompt="emit('sendPrompt', $event)"
        @update:plan-mode="emit('update:planMode', $event)"
      />
    </section>
    <RepositorySessionSourceDialog
      :visible="repositorySessionSourceVisible"
      :repository-name="repositorySessionSource?.repositoryName ?? ''"
      :branches="repositorySessionSourceBranches"
      :work-items="repositorySessionSourceWorkItems"
      :loading="repositorySessionSourceLoading"
      :error="repositorySessionSourceError"
      :sessions="repositorySessionAssignmentSessions"
      :assignment-state="repositorySessionAssignmentState"
      :assignment-error="repositorySessionAssignmentError"
      @close="closeRepositorySessionSource"
      @select-branch="openNewAgentForSourceBranch"
      @custom-work-item="customizeRepositorySessionWork"
      @preparation-complete="completePreparedRepositorySession"
      @start-work-item="startRepositorySessionWork"
    />
    <NewSourceWorktreeDialog
      :allow-destination-override="false"
      :branches="repositorySessionWorktreeBranches"
      :branches-loading="repositorySessionWorktreeBranchesLoading"
      :visible="repositorySessionWorktreeSource !== null"
      :repo="repositorySessionWorktreeRepository"
      :choose-destination="chooseSourceWorktreeDestination"
      :create-worktree="createRepositorySessionWorktree"
      :suggest-destination="suggestRepositorySessionWorktreePath"
      @close="closeRepositorySessionWorktree"
      @created="createRepositorySessionFromWorktree"
    />
    <RepositoryAcquireDialog
      :visible="repositoryAcquireVisible"
      :mode="repositoryAcquireMode"
      :connection="githubConnection"
      :authorization="workProviderAuthorization"
      :repositories="repositoryAcquireRepositories"
      :local-repository-identities="sourceRepositories.flatMap((repository) => repository.remoteIdentity ? [repository.remoteIdentity] : [])"
      :loading="repositoryAcquireCatalogLoading"
      :busy="repositoryAcquireBusy"
      :error="repositoryAcquireDisplayError"
      @close="closeRepositoryAcquire"
      @clone-url="cloneRepositoryAndOpen"
      @connect="connectGitHub"
      @open-authorization="openGitHubAuthorization"
      @select-repository="selectWorkRepository"
    />
    <ConversationHistoryDialog
      v-if="resumeSessionAgent"
      :agent="resumeSessionAgent"
      :visible="true"
      :list-conversations="listAgentConversations"
      :resume-conversation="resumeAgentConversation"
      @close="resumeSessionAgentId = null"
    />
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
      :initial-agent-name="pendingNewAgentName"
      :initial-new-team-name="pendingNewAgentTeamName"
      :initial-new-worktree-branch-name="pendingNewAgentWorktreeBranchName"
      :initial-source-repository-name="agentDialogSourceRepositoryName"
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
    <AgentCreationProgressDialog
      :progress="debugAgentCreationProgress"
      @close="closeDebugAgentCreationProgress"
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
import { translate } from '../i18n';
import { localizedErrorMessage, localizedText } from '../i18n/errors';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import debugAnnotationScreenshotUrl from '../../assets/debug-annotation.png?url';
import type { AgentFileActivity } from '@codex-claw/core/contracts';
import type { AddSshConnectionInput, Agent, AgentCreationProgress, AgentFilePreviewResult, AgentFileSearchItem, AgentGitStatus, AppCommand, ApprovalPreset, AppSnapshot, BackendApprovalDecision, BackendApprovalRequest, BackendApprovalScope, BackendCapabilities, BackendCommandSummary, BackendConnectionState, BackendConversationRef, BackendPermissionModeOption, BackendModelOption, BackendPluginSummary, BackendRuntimeStatus, BackendSkillSummary, ClaudeConversationSnapshot, ClawdDaemonStatus, ClientRequestResponse, CloneSourceRepositoryInput, ConversationSummary, CreateAgentInput, CreateAutomationInput, CreateQuickChatInput, CreateSourceWorktreeInput, CreateTeamInput, DesktopUpdateStatus, DevicePairingSession, DevicePairingStatus, GlobalWorkItemQuery, AutomationLocation, MoveAgentToTeamInput, OpenInApplication, OpenInApplicationCatalog, PairedDevice, ReasoningEffort, RendererMessage, ReorderAgentsInput, ReorderRepositoriesInput, ReorderTeamsInput, RendererSendPromptOptions, SetCodexResourceSharingInput, SidePanelRequest, SourceBranch, SourceFolderListing, SourceFolderListInput, SourceRepository, SourceWorktree, SshHostCandidate, Team, ThreadGoal, UpdateAgentInput, UpdateAutomationInput, UpdateRemoteConnectionInput, UpdateSettingsInput, UpdateTeamInput, WorkBacklogConfigurationInput, WorkIntegrationConnection, WorkItem, WorkItemPage, WorkItemQuery, WorkProviderAuthorization, WorkProviderKind, WorkRepository } from '@codex-claw/core/contracts';
import { defaultBackendCapabilities } from '@codex-claw/core/backend-capabilities';
import { createEmptySnapshot } from '@codex-claw/core/snapshot-construction';
import { defaultTeamColor } from '@codex-claw/core/team-colors';
import { projectAgentMentionLabels } from '@codex-claw/core/workspace-sidebar';
import { codexClawApi } from '../platform-api';
import AgentDialog from './AgentDialog.vue';
import AgentCreationProgressDialog from './AgentCreationProgressDialog.vue';
import RepositorySessionSourceDialog from './RepositorySessionSourceDialog.vue';
import { resolveRepositorySessionContext, type RepositorySessionSource } from './repository-session-context';
import NewSourceWorktreeDialog from './NewSourceWorktreeDialog.vue';
import RepositoryAcquireDialog from './RepositoryAcquireDialog.vue';
import CockpitView from './CockpitView.vue';
import ConversationHistoryDialog from './ConversationHistoryDialog.vue';
import ImageAnnotationDialog from './ImageAnnotationDialog.vue';
import FileQuickOpen from './FileQuickOpen.vue';
import AutomationsView from './AutomationsView.vue';
import TeamDialog from './TeamDialog.vue';
import AppShellNavigation from './AppShellNavigation.vue';
import BackendConnectionBanner from './BackendConnectionBanner.vue';
import WhatsNewDialog from './WhatsNewDialog.vue';
import AgentWorkspace from './AgentWorkspace.vue';
import SettingsView from './SettingsView.vue';
import FirstRunOnboardingGate from './FirstRunOnboardingGate.vue';
import CodexResourceSharingMigrationDialog from './CodexResourceSharingMigrationDialog.vue';
import type { SettingsTab } from './settings-tabs';
import {
  createCodexConversationPaneController,
  type CodexCapabilities,
  type CodexConversationLink,
  type CodexConversationPaneActions,
  type CodexConversationPaneState,
  type CodexConversationVisualization,
  type CodexComposerMenuItem,
  type CodexComposerMentionGroup,
  type CodexMessageImage,
  type CodexMessageImageContext,
  type CodexNativeAttachment,
  type CodexComposerState,
  type CodexQueuedPromptData as QueuedChatPrompt,
  type CodexRendererSendMessageOptions,
} from '@codex-app-sdk/vue';
import type { CodexConversationSnapshot } from '@codex-app-sdk/core/surface';
import { ShieldCheckIcon } from '../shared/icons/app-icons';
import { useFirstRunOnboarding } from './use-first-run-onboarding';
import { useRepositoryAcquisition } from './use-repository-acquisition';
import { useRepositorySession } from './use-repository-session';
import { useRightWorkspaceState } from './use-right-workspace-state';
import { useImageAnnotation } from './use-image-annotation';
import { useCockpitBacklog } from './use-cockpit-backlog';
import { useWorkspacePreviews } from './use-workspace-previews';
import { useWorkItemRouting } from './use-work-item-routing';
import { useAppShellCommands } from './use-app-shell-commands';

const props = withDefaults(defineProps<{
  snapshot: AppSnapshot;
  activeAgent: Agent | null;
  unreadAgentIds?: string[];
  agentFiles?: AgentFileSearchItem[];
  isLoading: boolean;
  isConversationLoading?: boolean;
  isConversationLoadFailed?: boolean;
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
  codexConversationSnapshot?: CodexConversationSnapshot | null;
  claudeConversationSnapshot?: ClaudeConversationSnapshot | null;
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
  assignedWorkItemsByProvider?: Partial<Record<WorkProviderKind, WorkItem[]>>;
  workBacklogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  workBacklogError?: string | null;
  daemonStatus?: ClawdDaemonStatus | null;
  daemonStatusError?: string | null;
  codexResourceSharingMigrationRequired?: boolean;
  chooseAgentFolder?: () => Promise<string | null>;
  chooseCodexBinary?: () => Promise<string | null>;
  chooseSourceFolder?: () => Promise<string | null>;
  listSourceFolders?: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  sourceRepositories?: SourceRepository[];
  listSourceRepositories?: (remoteConnectionId?: string) => Promise<SourceRepository[]>;
  cloneSourceRepository?: (input: CloneSourceRepositoryInput) => Promise<SourceRepository>;
  listSourceBranches?: (repoPath: string, remoteConnectionId?: string) => Promise<SourceBranch[]>;
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
  createQuickChat?: (input: CreateQuickChatInput) => Promise<Agent | null | void>;
  createTeam?: (input: CreateTeamInput) => Promise<Team | null | void>;
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
  getAutomationSnapshot?: (location?: AutomationLocation) => Promise<AppSnapshot>;
  createAutomation?: (input: CreateAutomationInput, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  updateAutomation?: (input: UpdateAutomationInput, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  runAutomation?: (automationId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  clearAutomationHistory?: (automationId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  deleteAutomationExecution?: (automationId: string, executionId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  deleteAutomation?: (automationId: string, location?: AutomationLocation) => Promise<AppSnapshot | void>;
  listAgentConversations?: (agentId: string) => Promise<ConversationSummary[]>;
  resumeAgentConversation?: (agentId: string, ref: BackendConversationRef) => Promise<void>;
  readConversationMessages?: (ref: BackendConversationRef, agentId: string, location?: AutomationLocation) => Promise<RendererMessage[]>;
  connectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  openWorkProviderAuthorization?: (provider: WorkProviderKind) => Promise<void>;
  completeWorkProviderConnection?: (provider: WorkProviderKind) => Promise<void>;
  disconnectWorkProvider?: (provider: WorkProviderKind) => Promise<void>;
  configureWorkBacklog?: (input: WorkBacklogConfigurationInput) => Promise<void>;
  loadWorkRepositories?: (provider: WorkProviderKind, location?: AutomationLocation) => Promise<WorkRepository[] | void>;
  loadWorkItems?: (provider: WorkProviderKind, repositoryId: string, location?: AutomationLocation, query?: WorkItemQuery) => Promise<WorkItem[] | void>;
  loadGlobalWorkItems?: (provider: WorkProviderKind, location?: AutomationLocation, query?: GlobalWorkItemQuery) => Promise<WorkItemPage>;
  loadAssignedWorkItems?: (provider: WorkProviderKind, location?: AutomationLocation) => Promise<WorkItem[] | void>;
  duplicateAgentAction?: (agentId: string, options?: import('@codex-claw/core/contracts').DuplicateAgentOptions) => Promise<Agent | null>;
  assignWorkItemAction?: (payload: { agentId: string; item: WorkItem; prompt?: string }) => Promise<void>;
  loadOlderAgentHistory?: (agentId: string) => Promise<void>;
  retryAgentHistory?: () => Promise<void>;
  deleteTurnAction?: (turnId: string) => Promise<void>;
  editTurnAction?: (payload: { content: string; turnId: string }) => Promise<void>;
  retryTurnAction?: (turnId: string) => Promise<void>;
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
  isConversationLoadFailed: false,
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
  assignedWorkItemsByProvider: () => ({}),
  workBacklogStatus: 'notLoaded',
  workBacklogError: null,
  daemonStatus: null,
  daemonStatusError: null,
  codexResourceSharingMigrationRequired: false,
  chooseAgentFolder: async () => null,
  chooseCodexBinary: async () => null,
  chooseSourceFolder: async () => null,
  listSourceFolders: async () => ({ path: '', parentPath: null, entries: [] }),
  sourceRepositories: () => [],
  listSourceRepositories: async () => [],
  cloneSourceRepository: async () => { throw new Error(translate('surface.appShell.repositoryCloningIsNotAvailable')); },
  listSourceBranches: async () => [],
  suggestSourceWorktreePath: async () => '',
  chooseSourceWorktreeDestination: async () => null,
  createSourceWorktree: async () => ({ name: '', path: '' }),
  previewAgentFile: async () => {
    throw new Error(translate('surface.appShell.filePreviewIsNotAvailable'));
  },
  openAgentGitDiff: async () => {
    throw new Error(translate('surface.appShell.gitDiffPreviewIsNotAvailable'));
  },
  getAgentGitWorkflow: async () => { throw new Error(translate('surface.appShell.gitWorkflowIsNotAvailable')); },
  generateAgentGitMessage: async () => { throw new Error(translate('surface.appShell.gitMessageGenerationIsNotAvailable')); },
  stageAgentGitFiles: async () => { throw new Error(translate('surface.appShell.gitStagingIsNotAvailable')); },
  commitAgentGitChanges: async () => { throw new Error(translate('surface.appShell.gitCommitIsNotAvailable')); },
  pushAgentGitBranch: async () => { throw new Error(translate('surface.appShell.gitPushIsNotAvailable')); },
  createAgentGitBranch: async () => { throw new Error(translate('surface.appShell.gitBranchCreationIsNotAvailable')); },
  createAgentGitPullRequest: async () => { throw new Error(translate('surface.appShell.pullRequestCreationIsNotAvailable')); },
  mergeAgentGitBranch: async () => { throw new Error(translate('surface.appShell.gitMergeIsNotAvailable')); },
  openInApplications: () => ({ defaultApplication: 'finder', applications: [] }),
  openAgentPath: async () => {
    throw new Error(translate('surface.appShell.openInIsNotAvailable'));
  },
  createAgent: async () => undefined,
  createQuickChat: async () => undefined,
  createTeam: async () => undefined,
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
  getAutomationSnapshot: async () => createEmptySnapshot(),
  createAutomation: async () => undefined,
  updateAutomation: async () => undefined,
  runAutomation: async () => undefined,
  clearAutomationHistory: async () => undefined,
  deleteAutomationExecution: async () => undefined,
  deleteAutomation: async () => undefined,
  listAgentConversations: async () => [],
  resumeAgentConversation: async () => undefined,
  readConversationMessages: async () => [],
  connectWorkProvider: async () => undefined,
  openWorkProviderAuthorization: async () => undefined,
  completeWorkProviderConnection: async () => undefined,
  disconnectWorkProvider: async () => undefined,
  configureWorkBacklog: async () => undefined,
  loadWorkRepositories: async () => undefined,
  loadWorkItems: async () => undefined,
  loadGlobalWorkItems: async (_provider, _location, query) => ({ items: [], page: query?.page ?? 1, pageSize: query?.pageSize ?? 50, totalItems: 0 }),
  loadAssignedWorkItems: async () => undefined,
  duplicateAgentAction: async () => null,
  assignWorkItemAction: async () => undefined,
  retryAgentHistory: async () => undefined,
  quit: async () => undefined,
});

const emit = defineEmits<{
  'close-team': [teamId: string];
  'disconnect-team': [teamId: string];
  'close-agent': [agentId: string];
  'cleanup-pull-request': [agentId: string];
  'clear-goal': [];
  'client-response': [response: ClientRequestResponse];
  'delete-turn': [turnId: string];
  'delete-queued-prompt': [promptId: string];
  'debug-mark-unread': [];
  'duplicate-agent': [agentId: string];
  'fork-agent': [agentId: string];
  'fork-turn': [turnId: string];
  'edit-turn': [payload: { content: string; turnId: string }];
  'interrupt-agent': [];
  'move-agent-to-team': [input: MoveAgentToTeamInput];
  'reorder-agents': [input: ReorderAgentsInput];
  'reorder-repositories': [input: ReorderRepositoriesInput];
  'reorder-teams': [input: ReorderTeamsInput];
  'assign-work-item': [payload: { agentId: string; item: WorkItem }];
  'remove-work-item-assignment': [item: WorkItem];
  'restart-agent': [agentId: string];
  'resolve-approval': [approvalId: string, decision: BackendApprovalDecision, scope: BackendApprovalScope];
  'retry-turn': [turnId: string];
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

const { t } = useI18n();

type AppSurface = 'agent' | 'cockpit' | 'automations' | 'settings';
const agentSidebarCollapsed = ref(false);
const codexResourceSharingMigrationPending = ref(false);
const agentListCompact = computed(() => props.snapshot.general.agentListCompact);
const codexResourceSharingBlocked = computed(() => props.snapshot.agents.some((agent) => (
  agent.status.type === 'starting' ||
  agent.status.type === 'working' ||
  agent.status.type === 'awaitingInput'
)));
const agentSidebarMinWidth = 80;
const agentSidebarMaxWidth = 420;
const agentSidebarWidth = ref(260);
const activeSurface = ref<AppSurface>('agent');
const fileQuickOpenVisible = ref(false);
const debugApproval = ref<{ agentId: string; request: BackendApprovalRequest } | null>(null);
const debugAgentCreationProgress = ref<AgentCreationProgress | null>(null);
const debugAgentCreationTimers: Array<ReturnType<typeof setTimeout>> = [];
const agentWorkspace = ref<{
  focusComposer(): void;
  handleBrowserOpenCommand(command: Extract<AppCommand, { type: 'open-browser' }>): void;
  openConversationLink(link: CodexConversationLink): void | Promise<void>;
  openConversationImage(image: CodexMessageImage, context?: CodexMessageImageContext): boolean;
  openConversationVisualization(visualization: CodexConversationVisualization): void;
  showDebugGitOperationProgress(operation: 'pullRequest' | 'merge'): void | Promise<void>;
  workspaceBodyElement(): HTMLElement | null;
} | null>(null);
const settingsActiveTab = ref<SettingsTab>('general');
const agentDialogVisible = ref(false);
const resumeSessionAgentId = ref<string | null>(null);
const agentDialogMode = ref<'create' | 'edit'>('create');
const editingAgentId = ref<string | null>(null);
const agentDialogTeamId = ref<string | null>(null);
const agentDialogSourceRepositoryName = ref<string | null>(null);
const agentDialogSourceBranchName = ref('');
const githubConnection = computed<WorkIntegrationConnection>(() => (
  props.snapshot.workBacklog.connections.find((connection) => connection.provider === 'github') ?? {
    provider: 'github',
    status: 'disconnected',
  }
));
const firstRunOnboarding = useFirstRunOnboarding({
  getApi: () => codexClawApi,
  isGitHubConnected: () => githubConnection.value.status === 'connected',
});
const {
  authentication,
  authenticationCancelling,
  authenticationError,
  authenticationLoading,
  completeVisible: onboardingCompleteVisible,
  gated: showOnboardingGate,
  githubVisible: githubOnboardingVisible,
  initialAuthenticationLoading,
  showLogin: showLoginLanding,
  cancelChatGptLogin,
  finish: finishFirstRunOnboarding,
  load: loadAuthentication,
  logout: logoutCodex,
  startChatGptLogin,
} = firstRunOnboarding;
const teamDialogVisible = ref(false);
const teamDialogMode = ref<'create' | 'edit'>('create');
const whatsNewVisible = ref(false);
const editingTeamId = ref<string | null>(null);
let cockpitInitialized = false;
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
const workItemRouting = useWorkItemRouting({
  actions: {
    assign: (payload) => props.assignWorkItemAction(payload),
    assignFromUi: (payload) => emit('assign-work-item', payload),
    createAgent: (input) => props.createAgent(input),
    createBranch: (agentId, input) => props.createAgentGitBranch(agentId, input),
    createWorktree: (input) => props.createSourceWorktree(input),
    duplicateAgent: (agentId, options) => props.duplicateAgentAction(agentId, options),
    loadItems: (provider, repositoryId, query) => props.loadWorkItems(provider, repositoryId, undefined, query),
  },
  model: {
    activeTeamId: () => activeTeam.value?.id ?? props.snapshot.activeTeamId ?? undefined,
    composerText: () => props.composerState.text,
    currentAgent: () => currentAgent.value,
    snapshot: () => props.snapshot,
    sourceRepositories: () => props.sourceRepositories,
  },
  ui: {
    confirmReassignment: async (message) => {
      try {
        await ElMessageBox.confirm(
          message,
          translate('surface.appShell.assignAnyway'),
          {
            cancelButtonText: translate('common.cancel'),
            confirmButtonText: translate('dynamic.misc.assignAnyway'),
            type: 'warning',
          },
        );
        return true;
      } catch {
        return false;
      }
    },
    focusComposer: () => {
      void nextTick(() => agentWorkspace.value?.focusComposer());
    },
    openNewAgent: (teamId, repositoryName) => openNewAgent(teamId, repositoryName),
    selectAgent: selectAgentFromShell,
    updateComposer: (agentId, text) => emit('update:composerState', {
      agentId,
      state: {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      },
    }),
  },
});
const {
  assignCreatedAgent: assignPendingWorkItemToCreatedAgent,
  assignExisting: assignExistingAgentWorkItem,
  clearNewAgent: clearPendingNewAgentWorkItem,
  createIsolatedAgent: createIsolatedWorkItemAgent,
  newAgentItem: pendingNewAgentWorkItem,
  newAgentTeamName: pendingNewAgentTeamName,
  newAgentWorktreeBranchName: pendingWorkItemBranchName,
  openNewAgent: openNewAgentForWorkItem,
  prefill: prefillWorkItemForAgent,
  startInExistingSession: startWorkItemInExistingSession,
  startMany: startCockpitWorkItems,
  startRepositoryWork,
} = workItemRouting;
const repositorySession = useRepositorySession({
  activeTeamId: () => activeTeam.value?.id ?? undefined,
  assignWorkItem: (payload) => props.assignWorkItemAction(payload),
  createAgent: (input) => props.createAgent(input),
  createIsolatedWorkItemAgent,
  createSourceWorktree: (input) => props.createSourceWorktree(input),
  getSnapshot: () => props.snapshot,
  getWorkRepositories: () => props.workRepositoriesByProvider.github ?? [],
  listSourceBranches: (repoPath, remoteConnectionId) => props.listSourceBranches(repoPath, remoteConnectionId),
  loadWorkItems: async (repositoryId, location) => await props.loadWorkItems(
    'github',
    repositoryId,
    location,
    { kind: 'all', state: 'open' },
  ) ?? [],
  loadWorkRepositories: async (location) => await props.loadWorkRepositories('github', location) ?? [],
  notifyError: (message) => ElMessage.error(message),
  prefillWorkItemForAgent,
  startWorkItemInExistingSession,
  suggestSourceWorktreePath: (input) => props.suggestSourceWorktreePath(input),
});
const {
  assignmentError: repositorySessionAssignmentError,
  assignmentSessions: repositorySessionAssignmentSessions,
  assignmentState: repositorySessionAssignmentState,
  branches: repositorySessionSourceBranches,
  close: closeRepositorySessionSource,
  closeWorktree: closeRepositorySessionWorktree,
  complete: completePreparedRepositorySession,
  createForSourceBranch: openNewAgentForSourceBranch,
  createFromWorktree: createRepositorySessionFromWorktree,
  createOnBranch: createRepositorySessionOnBranch,
  createWorktree: createRepositorySessionWorktree,
  customizeWork: customizeRepositorySessionWork,
  error: repositorySessionSourceError,
  listBranches: listRepositorySessionBranches,
  loading: repositorySessionSourceLoading,
  open: openRepositorySessionSource,
  openWorktree: openRepositorySessionWorktree,
  source: repositorySessionSource,
  startWork: startRepositorySessionWork,
  suggestWorktreePath: suggestRepositorySessionWorktreePath,
  visible: repositorySessionSourceVisible,
  workItems: repositorySessionSourceWorkItems,
  worktreeBranches: repositorySessionWorktreeBranches,
  worktreeBranchesLoading: repositorySessionWorktreeBranchesLoading,
  worktreeRepository: repositorySessionWorktreeRepository,
  worktreeSource: repositorySessionWorktreeSource,
} = repositorySession;
const repositoryAcquisition = useRepositoryAcquisition({
  activeTeam: () => activeTeam.value,
  activeTeamId: () => props.snapshot.activeTeamId ?? undefined,
  catalog: () => props.workRepositoriesByProvider.github,
  catalogError: () => props.workBacklogError,
  catalogStatus: () => props.workBacklogStatus,
  cloneRepository: (input) => props.cloneSourceRepository(input),
  connectGitHub: () => props.connectWorkProvider('github'),
  errorMessage: (error) => localizedErrorMessage(error, t),
  githubConnection: () => githubConnection.value,
  loadGitHubRepositories: () => props.loadWorkRepositories('github'),
  openGitHubAuthorization: () => props.openWorkProviderAuthorization('github'),
  openRepository: (repository, teamId) => openRepositorySessionSource({
    teamId,
    repositoryName: repository.name,
    repositoryRoot: repository.path,
  }),
  sourceRepositories: () => props.sourceRepositories,
});
const {
  busy: repositoryAcquireBusy,
  catalogLoading: repositoryAcquireCatalogLoading,
  cloneAndOpen: cloneRepositoryAndOpen,
  close: closeRepositoryAcquire,
  connect: connectGitHub,
  displayError: repositoryAcquireDisplayError,
  error: repositoryAcquireError,
  mode: repositoryAcquireMode,
  open: openRepositoryAcquire,
  openAuthorization: openGitHubAuthorization,
  repositories: repositoryAcquireRepositories,
  select: selectWorkRepository,
  visible: repositoryAcquireVisible,
} = repositoryAcquisition;
const activeTeamAgents = computed(() => {
  const team = activeTeam.value;
  if (!team) {
    return [];
  }

  return team.agentIds
    .map((agentId) => props.snapshot.agents.find((agent) => agent.id === agentId))
    .filter((agent): agent is Agent => Boolean(agent));
});
const agentMentionGroups = computed<readonly CodexComposerMentionGroup[]>(() => {
  if (activeTeamAgents.value.length === 0) return [];
  return [{
    id: 'agents',
    label: translate('surface.appShell.agents'),
    placement: 'before',
    items: projectAgentMentionLabels(activeTeamAgents.value, t('sidebar.quickChats')).map(({ agentId, label }) => ({
      id: agentId,
      value: `agent:${agentId}`,
      label,
      payload: { agentId },
    })),
  }];
});
const unreadTeamIds = computed(() => {
  const unreadAgentIdSet = new Set(props.unreadAgentIds);
  return props.snapshot.teams
    .filter((team) => (
      (activeSurface.value === 'cockpit' || team.id !== activeTeam.value?.id)
      && team.agentIds.some((agentId) => unreadAgentIdSet.has(agentId))
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
const rightWorkspaceState = useRightWorkspaceState({
  currentAgentId: () => currentAgent.value?.id,
  workspaceBody: () => agentWorkspace.value?.workspaceBodyElement() ?? null,
});
const {
  closeTab: closeRightWorkspaceTab,
  isVisible: isRightWorkspaceVisible,
  openTab: openRightWorkspaceTab,
  rightWorkspaceVisible,
  selectTab: selectRightWorkspaceTab,
  startResize: startRightWorkspaceResize,
  toggle: toggleRightWorkspace,
  toggleFiles: toggleFileExplorer,
  workspaceFor: rightWorkspaceFor,
  workspaces: rightWorkspaces,
} = rightWorkspaceState;
const workspacePreviews = useWorkspacePreviews({
  closeTab: closeRightWorkspaceTab,
  currentAgent: () => currentAgent.value,
  getSnapshot: () => props.snapshot,
  openAgentGitDiff: (agentId) => props.openAgentGitDiff(agentId),
  openTab: openRightWorkspaceTab,
  previewAgentFile: (agentId, filePath) => props.previewAgentFile(agentId, filePath),
  workspaceFor: rightWorkspaceFor,
});
const {
  handleFileActivity,
  openAgentGitDiff: openAgentGitDiffForAgent,
  openConversationFile: openFilePreview,
  openFile: openFilePreviewForAgent,
  openMarkdown: openMarkdownRequest,
  openSidePanel: openSidePanelRequest,
} = workspacePreviews;
function openAgentGitDiffPreview(agentId = currentAgent.value?.id): Promise<void> {
  return agentId ? openAgentGitDiffForAgent(agentId) : Promise.resolve();
}
const imageAnnotation = useImageAnnotation({
  composerAttachments: () => props.composerAttachments,
  composerState: () => props.composerState,
  currentAgentId: () => currentAgent.value?.id,
  debugFallbackImageSource: debugAnnotationScreenshotUrl,
  notifyError: (message) => ElMessage.error(message),
  updateComposerAttachments: (agentId, attachments) => {
    emit('update:composerAttachments', { agentId, attachments });
  },
  updateComposerState: (agentId, state) => {
    emit('update:composerState', { agentId, state });
  },
});
const {
  activeCounts: activeAttachmentAnnotationCounts,
  close: closeImageAnnotation,
  fileName: imageAnnotationFileName,
  forward: forwardCodexPromptWithImageAnnotations,
  handleError: handleImageAnnotationError,
  imageSource: imageAnnotationImageSource,
  initialAnnotations: imageAnnotationInitialAnnotations,
  openAttachment: openAttachmentImageAnnotation,
  openDebug: openDebugImageAnnotation,
  pixelRatio: imageAnnotationPixelRatio,
  prune: pruneSavedImageAnnotations,
  save: saveImageAnnotation,
  target: attachmentAnnotationTarget,
  visible: imageAnnotationVisible,
} = imageAnnotation;
const cockpitBacklogState = useCockpitBacklog({
  configure: (input) => props.configureWorkBacklog(input),
  confirmLoadAll: async () => {
    try {
      await ElMessageBox.confirm(
        translate('surface.appShell.thisLoadsYourGlobalGitHubBacklogOnePageAtATimeLargeBackl'),
        translate('surface.appShell.loadTheGlobalBacklog'),
        {
          confirmButtonText: translate('dynamic.misc.loadEverything'),
          cancelButtonText: translate('common.cancel'),
          type: 'warning',
        },
      );
      return true;
    } catch {
      return false;
    }
  },
  getSnapshot: () => props.snapshot,
  getWorkBacklogError: () => props.workBacklogError,
  getWorkBacklogStatus: () => props.workBacklogStatus,
  getWorkItemsByRepository: () => props.workItemsByRepository,
  getWorkRepositories: () => props.workRepositoriesByProvider.github ?? [],
  loadGlobalWorkItems: (query) => props.loadGlobalWorkItems('github', undefined, query),
  loadWorkItems: async (repositoryId) => {
    await props.loadWorkItems('github', repositoryId);
  },
  loadWorkRepositories: async () => {
    await props.loadWorkRepositories('github');
  },
});
const {
  changePage: changeGlobalWorkItemsPage,
  initialize: initializeCockpitBacklog,
  refresh: refreshWorkItems,
  selectAssignee: selectWorkAssigneeForCockpit,
  selectGlobalScope: selectGlobalBacklogScope,
  selectRepository: selectWorkRepositoryForCockpit,
  selectTag: selectWorkTagForCockpit,
  workBacklog: cockpitWorkBacklog,
} = cockpitBacklogState;
const effectiveApprovals = computed(() => {
  const fixture = debugApproval.value;
  const providerApprovals = currentAgent.value?.backend === 'codex'
    ? props.codexConversationSnapshot?.approvals ?? []
    : props.approvals ?? [];
  return [
    ...providerApprovals,
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
const conversationKey = computed(() => {
  const session = currentAgent.value?.backendSession;
  if (session?.kind === 'codex') return `codex:${session.threadId}`;
  if (session?.kind === 'claude') return `claude:${session.sessionId}`;
  return currentAgent.value ? `agent:${currentAgent.value.id}` : 'no-agent';
});
const providerConversation = computed(() => (
  currentAgent.value?.backend === 'codex'
    ? props.codexConversationSnapshot ?? null
    : currentAgent.value?.backend === 'claude'
      ? props.claudeConversationSnapshot ?? null
      : null
));
const conversationMessages = computed(() => providerConversation.value?.messages ?? []);
const conversationLatestTurnId = computed(() => providerConversation.value?.turnIds.at(-1) ?? null);
const conversationHasRunningPlanTool = computed(() => conversationMessages.value.some(
  (message) => message.parts.some(
    (part) => part.type === 'tool' && part.status === 'running' && part.metadata?.planProgress === true,
  ),
));
const conversationPlan = computed(() => (
  currentAgent.value?.backend === 'claude'
    ? props.claudeConversationSnapshot?.plan ?? null
    : currentAgent.value?.plan ?? null
));
const conversationActiveTurnId = computed(() => {
  if (providerConversation.value) return providerConversation.value.activeTurnId;
  if (currentAgent.value?.backend === 'codex') return null;
  if (!props.isSending) return null;
  for (let index = conversationMessages.value.length - 1; index >= 0; index -= 1) {
    const turnId = conversationMessages.value[index]?.turnId;
    if (turnId) return turnId;
  }
  return null;
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
  deleteTurn: props.backendCapabilities.deleteTurn,
  editTurn: props.backendCapabilities.editTurn,
  retryTurn: props.backendCapabilities.retryTurn,
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
    label: translate('surface.appShell.permissions'),
    icon: ShieldCheckIcon,
    submenuAlignment: 'bottom',
    submenuWidth: 'wide',
    items: modes.map((mode) => permissionModeMenuItem(mode, props.permissionMode)),
  }];
});
const conversationPaneState: CodexConversationPaneState = {
  identity: {
    get conversationKey() { return conversationKey.value; },
    get activeTurnId() { return conversationActiveTurnId.value; },
    get turns() { return providerConversation.value?.turns; },
    get messages() { return conversationMessages.value; },
    get busy() { return providerConversation.value?.busy ?? props.isSending; },
    get disabled() {
      return !currentAgent.value || (props.isConversationLoadFailed && conversationMessages.value.length === 0);
    },
  },
  history: {
    get hasOlder() { return providerConversation.value?.historyState?.hasOlder ?? props.historyHasOlder; },
    get loading() {
      return Boolean(currentAgent.value?.backendSession)
        && conversationMessages.value.length === 0
        && (providerConversation.value?.historyLoading ?? (props.isLoading || props.isConversationLoading));
    },
    get loadingOlder() { return providerConversation.value?.historyState?.loadingOlder ?? props.historyLoadingOlder; },
  },
  thread: {
    get approvals() { return effectiveApprovals.value; },
    get answeredClientRequestIds() {
      return providerConversation.value
        ? new Set(providerConversation.value.answeredClientRequestIds)
        : currentAgent.value?.backend === 'codex' ? new Set<string>() : props.answeredClientRequestIds;
    },
    get goal() {
      return currentAgent.value?.backend === 'codex'
        ? props.codexConversationSnapshot?.goal ?? null
        : props.goal ?? null;
    },
    get queuedPrompts() {
      return currentAgent.value?.backend === 'codex'
        ? props.codexConversationSnapshot?.queuedPrompts ?? []
        : props.queuedPrompts;
    },
    get contextUsage() { return providerConversation.value?.contextUsage ?? currentAgent.value?.contextUsage ?? null; },
  },
  composer: {
    get state() { return props.composerState; },
    get attachments() { return props.composerAttachments; },
    get placeholder() {
      if (!currentAgent.value) return translate('surface.appShell.selectAnAgent');
      const backend = currentAgent.value.backend === 'claude' ? translate('surface.appShell.claude') : translate('surface.appShell.codex');
      return props.isSending ? `${backend} is working...` : translate('surface.appShell.askForFollowUpChanges');
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
    get mentionGroups() { return agentMentionGroups.value; },
    get modelCatalogStatus() { return props.modelCatalogStatus; },
    get skillCatalogStatus() { return props.skillCatalogStatus; },
  },
  get capabilities() { return conversationCapabilities.value; },
  policy: {
    get attachEnabled() { return props.backendCapabilities.attachments; },
    get canDeleteTurn() { return props.backendCapabilities.deleteTurn; },
    get canEditTurn() { return props.backendCapabilities.editTurn; },
    get canForkTurn() {
      const agent = currentAgent.value;
      return Boolean(agent && forkableAgentIds.value.includes(agent.id));
    },
    get canRetryTurn() { return props.backendCapabilities.retryTurn; },
  },
};
const conversationPaneActions: CodexConversationPaneActions = {
  clearGoal: () => emit('clear-goal'),
  clientResponse: (response) => emit('client-response', response),
  deleteTurn: (turnId) => props.deleteTurnAction?.(turnId) ?? emit('delete-turn', turnId),
  deleteQueuedPrompt: (promptId) => emit('delete-queued-prompt', promptId),
  editTurn: (payload) => props.editTurnAction?.(payload) ?? emit('edit-turn', payload),
  forkTurn: (turnId) => emit('fork-turn', turnId),
  interrupt: () => emit('interrupt-agent'),
  loadOlderHistory: () => props.loadOlderAgentHistory?.(currentAgent.value?.id ?? ''),
  menuSelect: (item) => {
    const command = permissionModeCommand(item.payload);
    if (command) emit('select-permission-mode', command.mode);
  },
  openLink: (link) => agentWorkspace.value?.openConversationLink(link),
  openImage: (image, context) => agentWorkspace.value?.openConversationImage(image, context) ?? false,
  openVisualization: (visualization) => agentWorkspace.value?.openConversationVisualization(visualization),
  resolveApproval: forwardApprovalResolution,
  retryTurn: (turnId) => props.retryTurnAction?.(turnId) ?? emit('retry-turn', turnId),
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
    label: localizedText(mode.label, translate) ?? mode.id,
    description: localizedText(mode.description, translate) ?? '',
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

const showAgentDialogTeamSelector = computed(() => agentDialogMode.value === 'create' && pendingNewAgentWorkItem.value !== null);
const pendingNewAgentName = '';
const pendingNewAgentWorktreeBranchName = computed(() => (
  pendingNewAgentWorkItem.value ? pendingWorkItemBranchName.value : agentDialogSourceBranchName.value
));
const isAgentEmpty = computed(() => activeTeamAgents.value.length === 0);
const cockpitVisible = computed(() => activeSurface.value === 'cockpit');
const automationsVisible = computed(() => activeSurface.value === 'automations');
const settingsVisible = computed(() => activeSurface.value === 'settings');
const isAgentWorkspaceVisible = computed(() => activeSurface.value === 'agent');
const isModalDialogVisible = computed(() => (
  agentDialogVisible.value
  || teamDialogVisible.value
  || whatsNewVisible.value
  || imageAnnotationVisible.value
  || debugAgentCreationProgress.value !== null
  || fileQuickOpenVisible.value
  || props.codexResourceSharingMigrationRequired
));
const { quickAgentShortcutsVisible } = useAppShellCommands({
  state: {
    activeTeam: () => activeTeam.value,
    activeTeamAgents: () => activeTeamAgents.value,
    agents: () => props.snapshot.agents,
    attachmentsEnabled: () => props.backendCapabilities.attachments,
    composerAttachments: () => props.composerAttachments,
    currentAgent: () => currentAgent.value,
    isAgentWorkspaceVisible: () => isAgentWorkspaceVisible.value,
    isModalDialogVisible: () => isModalDialogVisible.value,
    showOnboardingGate: () => showOnboardingGate.value,
    teams: () => props.snapshot.teams,
  },
  actions: {
    closeAgent: (agentId) => emit('close-agent', agentId),
    closeTeam: (teamId) => emit('close-team', teamId),
    debugMarkUnread: () => emit('debug-mark-unread'),
    duplicateAgent: (agentId) => emit('duplicate-agent', agentId),
    editAgent: openEditAgent,
    focusComposer: () => agentWorkspace.value?.focusComposer(),
    newTeam: openNewTeam,
    openAgentSurface: () => { activeSurface.value = 'agent'; },
    openBrowser: (command) => agentWorkspace.value?.handleBrowserOpenCommand(command),
    openDebugImageAnnotation,
    openDebugOperationProgress,
    openFileQuick: () => { fileQuickOpenVisible.value = true; },
    openGitReview: openAgentGitDiffPreview,
    openMarkdown: openMarkdownRequest,
    openRightWorkspaceTab: (tab) => openRightWorkspaceTab(tab),
    openSettings,
    openWhatsNew,
    quit,
    restartAgent: (agentId) => emit('restart-agent', agentId),
    selectAgent: selectAgentFromShell,
    selectTeam: selectTeamFromRail,
    sendAgentPrompt: (agentId, prompt) => emit('send-agent-prompt', { agentId, prompt }),
    setDebugApproval: (approval) => { debugApproval.value = approval; },
    toggleSpokenAnnouncementsMuted,
    updateComposerAttachments: (agentId, attachments) => emit('update:composerAttachments', { agentId, attachments }),
    updateComposerState: (agentId, state) => emit('update:composerState', { agentId, state }),
  },
});

function openDebugOperationProgress(
  kind: Extract<AppCommand, { type: 'debug-operation-progress' }>['kind'],
): void {
  if (kind === 'worktreeInitialization') {
    startDebugAgentCreationProgress();
    return;
  }

  activeSurface.value = 'agent';
  void nextTick(() => agentWorkspace.value?.showDebugGitOperationProgress(kind));
}

function startDebugAgentCreationProgress(): void {
  clearDebugAgentCreationTimers();
  const id = `debug-agent-creation-${Date.now()}`;
  debugAgentCreationProgress.value = {
    id,
    state: 'running',
    backend: 'codex',
    repositoryName: 'codex-claw',
    createWorktree: true,
    branchName: 'debug/worktree-preview',
    hasPrompt: true,
    phase: 'creatingWorktree',
  };
  scheduleDebugAgentCreationUpdate(id, 1_200, {
    phase: 'initializingWorktree',
    initializationDetail: 'Repository instructions · npm install',
  });
  scheduleDebugAgentCreationUpdate(id, 3_200, { phase: 'creatingAgent' });
  scheduleDebugAgentCreationUpdate(id, 4_700, { phase: 'startingPrompt' });
  scheduleDebugAgentCreationUpdate(id, 6_200, {
    state: 'success',
    agentId: 'debug-agent',
    agentName: 'debug/worktree-preview',
  });
}

function scheduleDebugAgentCreationUpdate(
  id: string,
  delay: number,
  update: Partial<AgentCreationProgress>,
): void {
  debugAgentCreationTimers.push(setTimeout(() => {
    if (debugAgentCreationProgress.value?.id !== id) return;
    debugAgentCreationProgress.value = { ...debugAgentCreationProgress.value, ...update };
  }, delay));
}

function closeDebugAgentCreationProgress(id: string): void {
  if (debugAgentCreationProgress.value?.id !== id) return;
  clearDebugAgentCreationTimers();
  debugAgentCreationProgress.value = null;
}

function clearDebugAgentCreationTimers(): void {
  debugAgentCreationTimers.splice(0).forEach((timer) => clearTimeout(timer));
}

onBeforeUnmount(clearDebugAgentCreationTimers);
const showAgentSidebar = computed(() => isAgentWorkspaceVisible.value && !agentSidebarCollapsed.value && !isAgentEmpty.value);
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
onMounted(() => {
  void loadAuthentication();
});

function setAgentSidebarWidth(width: number): void {
  agentSidebarWidth.value = Math.min(Math.max(width, agentSidebarMinWidth), agentSidebarMaxWidth);
}

function openNewAgent(
  teamId?: string,
  sourceRepositoryName: string | null = null,
  sourceBranchName = '',
): void {
  agentDialogMode.value = 'create';
  editingAgentId.value = null;
  agentDialogTeamId.value = teamId ?? activeTeam.value?.id ?? null;
  agentDialogSourceRepositoryName.value = sourceRepositoryName;
  agentDialogSourceBranchName.value = sourceBranchName;
  agentDialogVisible.value = true;
}

function repositorySessionContext(source?: Pick<RepositorySessionSource, 'agentId' | 'teamId'> | null) {
  return resolveRepositorySessionContext(props.snapshot, source, activeTeam.value?.id);
}

async function createQuickChat(): Promise<void> {
  const { teamId } = repositorySessionContext(null);
  try {
    await props.createQuickChat(teamId ? { teamId } : {});
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  }
}

async function handleStartWorkAction(action: 'github' | 'local' | 'url'): Promise<void> {
  if (action === 'local') {
    await openLocalRepositorySession();
    return;
  }
  await openRepositoryAcquire(action);
}

async function openLocalRepositorySession(): Promise<void> {
  const folder = await props.chooseAgentFolder();
  if (!folder) return;
  const repositoryName = folder.split(/[\\/]/u).filter(Boolean).at(-1) ?? 'workspace';
  const { teamId } = repositorySessionContext(null);
  try {
    const branches = await props.listSourceBranches(folder);
    if (branches.length > 0) {
      await openRepositorySessionSource({
        teamId,
        repositoryName,
        repositoryRoot: folder,
      });
      return;
    }
  } catch {
    // A plain folder remains a valid session workspace.
  }
  await props.createAgent({
    name: null,
    folder,
    backend: 'codex',
    ...(teamId ? { teamId } : {}),
  });
}

function completeGitHubOnboardingStep(): void {
  repositoryAcquireBusy.value = false;
  repositoryAcquireError.value = null;
  firstRunOnboarding.completeGitHub();
}

watch(() => githubConnection.value.status, (status) => {
  if (githubOnboardingVisible.value && status === 'connected') {
    completeGitHubOnboardingStep();
  }
});

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
  const remoteSnapshot = await props.getAutomationSnapshot?.({ kind: 'remote', remoteConnectionId: connectionId });
  return remoteSnapshot?.teams ?? [];
}

function openEditAgent(agentId: string): void {
  agentDialogMode.value = 'edit';
  editingAgentId.value = agentId;
  agentDialogTeamId.value = null;
  agentDialogSourceRepositoryName.value = null;
  agentDialogSourceBranchName.value = '';
  agentDialogVisible.value = true;
}

function closeAgentDialog(): void {
  agentDialogVisible.value = false;
  editingAgentId.value = null;
  agentDialogTeamId.value = null;
  agentDialogSourceRepositoryName.value = null;
  agentDialogSourceBranchName.value = '';
  clearPendingNewAgentWorkItem();
}

async function createAgentFromDialog(input: CreateAgentInput & { newTeamName?: string; teamId?: string }): Promise<void> {
  const { newTeamName, ...agentInput } = input;
  const targetTeamId = agentDialogMode.value === 'create'
    ? await resolveSelectedTeam(input.teamId ?? agentDialogTeamId.value, newTeamName)
    : null;
  const agent = await props.createAgent(targetTeamId ? { ...agentInput, teamId: targetTeamId } : agentInput);
  assignPendingWorkItemToCreatedAgent(agent);
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

async function openCockpit(): Promise<void> {
  if (cockpitVisible.value && cockpitInitialized) return;
  activeSurface.value = 'cockpit';
  cockpitInitialized = true;
  await initializeCockpitBacklog();
}

function openAutomations(): void {
  activeSurface.value = 'automations';
}

function openSettings(): void {
  activeSurface.value = 'settings';
}

function toggleSpokenAnnouncementsMuted(): void {
  if (!props.snapshot.general.spokenAnnouncementsEnabled) return;
  void updateSettings({
    general: {
      spokenAnnouncementsMuted: !props.snapshot.general.spokenAnnouncementsMuted,
    },
  });
}

function openWhatsNew(): void {
  whatsNewVisible.value = true;
}

async function createAutomation(input: CreateAutomationInput, location?: AutomationLocation): Promise<AppSnapshot | void> {
  return props.createAutomation(input, location);
}

async function updateAutomation(input: UpdateAutomationInput, location?: AutomationLocation): Promise<AppSnapshot | void> {
  return props.updateAutomation(input, location);
}

async function runAutomation(automationId: string, location?: AutomationLocation): Promise<AppSnapshot | void> {
  return props.runAutomation(automationId, location);
}

async function clearAutomationHistory(automationId: string, location?: AutomationLocation): Promise<AppSnapshot | void> {
  return props.clearAutomationHistory(automationId, location);
}

async function deleteAutomationExecution(automationId: string, executionId: string, location?: AutomationLocation): Promise<AppSnapshot | void> {
  return props.deleteAutomationExecution(automationId, executionId, location);
}

async function deleteAutomation(automationId: string, location?: AutomationLocation): Promise<AppSnapshot | void> {
  return props.deleteAutomation(automationId, location);
}

async function readConversationMessages(ref: BackendConversationRef, agentId: string, location?: AutomationLocation): Promise<RendererMessage[]> {
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

function openResumeSession(agentId: string): void {
  resumeSessionAgentId.value = agentId;
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

 async function updateSettings(input: UpdateSettingsInput): Promise<void> {
  await props.updateSettings(input);
}

async function updateRepositoryIcon(payload: {
  repositoryKey: string;
  repositoryRoot: string;
  icon: string | undefined;
}): Promise<void> {
  const repositoryIcons = { ...props.snapshot.general.repositoryIcons };
  if (payload.icon) {
    repositoryIcons[payload.repositoryKey] = payload.icon;
    if (payload.repositoryKey !== payload.repositoryRoot) delete repositoryIcons[payload.repositoryRoot];
  } else {
    delete repositoryIcons[payload.repositoryKey];
    delete repositoryIcons[payload.repositoryRoot];
  }
  await updateSettings({ general: { repositoryIcons } });
}

async function updateCollapsedRepositories(collapsedRepositoryKeys: string[]): Promise<void> {
  await updateSettings({ general: { collapsedRepositoryKeys } });
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

async function quit(): Promise<void> {
  await props.quit();
}

 const activeTeamName = computed(() => activeTeam.value?.name ?? 'Codex Claw');
const resumeSessionAgent = computed(() => (
  props.snapshot.agents.find((agent) => agent.id === resumeSessionAgentId.value) ?? null
));
watch(() => props.sidePanelRequest, (request) => {
  if (!request) {
    return;
  }

  openSidePanelRequest(request);
}, { immediate: true });

watch(() => props.fileActivity, (activity) => {
  if (activity) handleFileActivity(activity);
});

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

.app-shell--auth-gated > :not(.codex-login):not(.github-onboarding):not(.onboarding-complete) {
  visibility: hidden;
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

</style>
