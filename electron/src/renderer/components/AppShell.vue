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
        :active-agent-id="currentAgent?.id ?? null"
        :bench="activeBench"
        :teams="snapshot.teams"
        :team-id="activeTeam?.id ?? null"
        :team-name="activeTeamName"
        :compact="agentListCompact"
        :width="agentSidebarWidth"
        :min-width="agentSidebarMinWidth"
        :max-width="agentSidebarMaxWidth"
        :list-conversations="listAgentConversations"
        :resume-conversation="resumeAgentConversation"
        @collapse-sidebar="agentSidebarCollapsed = true"
        @close-agent="$emit('close-agent', $event)"
        @deploy-bench-template="deployBenchTemplateForActiveTeam"
        @duplicate-agent="$emit('duplicate-agent', $event)"
        @edit-agent="openEditAgent"
        @move-agent-to-team="$emit('move-agent-to-team', $event)"
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
          :update-status="updateStatus"
          :execution-plan-available="Boolean(currentTurnPlan)"
          :execution-plan-open="executionPlanVisible"
          @expand-sidebar="agentSidebarCollapsed = false"
          @toggle-execution-plan="toggleExecutionPlan"
          @toggle-workspace="toggleRightWorkspace"
          @open-git-diff="openAgentGitDiffPreview"
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
            :messages="messages"
            :agent="currentAgent"
            :agents="snapshot.agents"
            :agent-files="agentFiles"
            :is-loading="isLoading || isConversationLoading"
            :is-sending="isSending"
            :answered-client-request-ids="answeredClientRequestIds"
            :backend-models="backendModels"
            :backend-commands="backendCommands"
            :backend-skills="backendSkills"
            :backend-capabilities="backendCapabilities"
            :model-catalog-status="modelCatalogStatus"
            :skill-catalog-status="skillCatalogStatus"
            :goal="goal"
            :approvals="approvals"
            :plan="currentTurnPlan"
            :plan-visible="executionPlanVisible"
            :approval-preset="approvalPreset"
            :plan-mode="planMode"
            :selected-model-id="selectedModelId"
            :selected-reasoning-effort="selectedReasoningEffort"
            :selected-service-tier="selectedServiceTier"
            :queued-prompts="queuedPrompts"
            :composer-state="composerState"
            :attachments="composerAttachments"
            @client-response="$emit('client-response', $event)"
            @close-plan="closeExecutionPlan"
            @delete-message="$emit('delete-message', $event)"
            @delete-queued-prompt="$emit('delete-queued-prompt', $event)"
            @edit-message="$emit('edit-message', $event)"
            @interrupt-agent="$emit('interrupt-agent')"
            @open-file="openFilePreview"
            @retry-message="$emit('retry-message', $event)"
            @select-model="$emit('select-model', $event)"
            @select-reasoning-effort="$emit('select-reasoning-effort', $event)"
            @select-service-tier="$emit('select-service-tier', $event)"
            @select-approval-preset="$emit('select-approval-preset', $event)"
            @resolve-approval="forwardApprovalResolution"
            @clear-goal="$emit('clear-goal')"
            @send-prompt="forwardPrompt"
            @steer-prompt="forwardSteerPrompt"
            @steer-queued-prompt="$emit('steer-queued-prompt', $event)"
            @update:plan-mode="$emit('update:planMode', $event)"
            @update:composer-state="$emit('update:composerState', $event)"
            @update:composer-attachments="$emit('update:composerAttachments', $event)"
          />
          <RightWorkspacePanel
            v-for="agent in snapshot.agents"
            :key="agent.id"
            v-show="isRightWorkspaceVisible(agent.id)"
            class="app-shell__right-workspace"
            :style="{ flexBasis: `${rightWorkspaceFor(agent.id).width}px` }"
            :active-tab="rightWorkspaceFor(agent.id).activeTab"
            :agent="agent"
            :git-panel="effectiveGitReviewPanelFor(agent)"
            :git-status="snapshot.agentGitStatuses[agent.id] ?? null"
            :file-panels="rightWorkspaceFor(agent.id).filePanels"
            :diff-panels="rightWorkspaceFor(agent.id).diffPanels"
            :tabs="rightWorkspaceFor(agent.id).tabs"
            :visible="isRightWorkspaceVisible(agent.id)"
            :browser-id="rightWorkspaceFor(agent.id).browserId"
            :browser-initial-url="rightWorkspaceFor(agent.id).browserInitialUrl"
            :browser-open-request-id="rightWorkspaceFor(agent.id).browserOpenRequestId"
            @close-tab="closeRightWorkspaceTab(agent.id, $event)"
            @open-tab="openRightWorkspaceTabFromMenu(agent.id, $event)"
            @refresh-git-diff="openAgentGitDiffPreview(agent.id)"
            @select-tab="selectRightWorkspaceTab(agent.id, $event)"
            @send-prompt="forwardPrompt"
          />
          <div
            v-if="rightWorkspaceVisible"
            class="app-shell__right-workspace-resizer"
            aria-label="Resize right workspace"
            @pointerdown="startRightWorkspaceResize"
          />
          <SidePanel
            v-if="sidePanel"
            :panel="sidePanel"
            :plan-updating="isPlanPreviewUpdating"
            @cancel-plan="cancelPlanReview"
            @close="closeSidePanel"
            @comment-plan="commentOnPlan"
            @confirm-plan="confirmPlan"
            @refresh-git-diff="openAgentGitDiffPreview"
          />
        </div>
      </template>
    </section>
    <AgentDialog
      :visible="agentDialogVisible"
      :mode="agentDialogMode"
      :agent="editingAgent"
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
  </main>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { PRIMARY_BROWSER_ID, type AddSshConnectionInput, type Agent, type AgentFileActivity, type AgentFilePreviewResult, type AgentFileSearchItem, type AgentGitStatus, type AppCommand, type ApprovalPreset, type AppSnapshot, type BackendApprovalDecision, type BackendApprovalRequest, type BackendApprovalScope, type BackendCapabilities, type BackendCommandSummary, type BackendConnectionState, type BackendConversationRef, type BenchLocation, type BenchTemplate, type BackendModelOption, type BackendRuntimeStatus, type BackendSkillSummary, type ClawdDaemonStatus, type ClientRequestResponse, type CodexAuthentication, type ConversationFileLink, type ConversationSummary, type CreateAgentInput, type CreateLoopInput, type CreateSourceWorktreeInput, type CreateTeamInput, type DeployBenchTemplateInput, type DesktopUpdateStatus, type DevicePairingSession, type DevicePairingStatus, type LoopLocation, type MoveAgentToTeamInput, type PairedDevice, type ReasoningEffort, type RemoveBenchTemplateInput, type RendererMessage, type ReorderAgentsInput, type ReorderTeamsInput, type SendPromptOptions, type SidePanelMarkdownRequest, type SidePanelRequest, type SourceFolderListing, type SourceFolderListInput, type SourceRepository, type SourceWorktree, type SshHostCandidate, type Team, type ThreadGoal, type ThreadPlan, type UpdateAgentInput, type UpdateLoopInput, type UpdateRemoteConnectionInput, type UpdateSettingsInput, type UpdateTeamInput, type WorkBacklogConfigurationInput, type WorkItem, type WorkProviderAuthorization, type WorkProviderKind, type WorkRepository } from '@codex-claw/shared/contracts';
import { defaultBackendCapabilities } from '@codex-claw/shared/backend-capabilities';
import { createEmptySnapshot } from '@codex-claw/shared/snapshot';
import { defaultTeamColor } from '@codex-claw/shared/team-colors';
import { findAssignedAgentForWorkItem } from '@codex-claw/shared/work-assignments';
import AgentDialog from './AgentDialog.vue';
import AgentEmptyState from './AgentEmptyState.vue';
import AgentHeader from './AgentHeader.vue';
import AgentSidebar from './AgentSidebar.vue';
import CockpitView from './CockpitView.vue';
import ConversationPane from './ConversationPane.vue';
import LoopsView from './LoopsView.vue';
import SidePanel from './SidePanel.vue';
import TeamDialog from './TeamDialog.vue';
import TeamRail from './TeamRail.vue';
import BenchAgentAssignmentDialog from './BenchAgentAssignmentDialog.vue';
import RightWorkspacePanel from './RightWorkspacePanel.vue';
import SettingsView from './SettingsView.vue';
import CodexLoginLanding from './CodexLoginLanding.vue';
import type { SettingsTab } from './settings-tabs';
import { confirmCloseTeam } from './team-close-confirmation';
import {
  type CodexNativeAttachment,
  type CodexComposerState,
  languageForFilePath,
  type CodexQueuedPromptData as QueuedChatPrompt,
} from 'codex-app-sdk/vue';
import type { PlanReviewComment, SidePanelGitDiffState, SidePanelState } from './side-panel';
import {
  isRightWorkspaceFileTab,
  isRightWorkspaceDiffTab,
  rightWorkspaceDiffTab,
  rightWorkspaceFileTab,
  rightWorkspaceMarkdownTab,
  type RightWorkspaceDiffPanel,
  type RightWorkspaceDiffTab,
  type RightWorkspaceFilePanel,
  type RightWorkspaceFileTab,
  type RightWorkspaceTab,
} from './right-workspace';

const props = withDefaults(defineProps<{
  snapshot: AppSnapshot;
  activeAgent: Agent | null;
  agentFiles?: AgentFileSearchItem[];
  messages: RendererMessage[];
  isLoading: boolean;
  isConversationLoading?: boolean;
  isSending: boolean;
  connectionState?: BackendConnectionState;
  goal?: ThreadGoal | null;
  approvals?: BackendApprovalRequest[];
  approvalPreset?: ApprovalPreset | null;
  answeredClientRequestIds?: Set<string>;
  backendModels?: BackendModelOption[];
  backendCommands?: BackendCommandSummary[];
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
  createAgent?: (input: CreateAgentInput) => Promise<Agent | null | void>;
  createTeam?: (input: CreateTeamInput) => Promise<Team | null | void>;
  deployBenchTemplateAction?: (input: string | DeployBenchTemplateInput) => Promise<Agent | null | void>;
  updateTeam?: (input: UpdateTeamInput) => Promise<void>;
  updateAgent?: (input: UpdateAgentInput) => Promise<void>;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
  getPluginStatus?: () => Promise<import('@codex-claw/shared/contracts').AppPluginStatus>;
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
  loadWorkItems?: (provider: WorkProviderKind, repositoryId: string, location?: LoopLocation) => Promise<WorkItem[] | void>;
  quit?: () => Promise<void>;
}>(), {
  answeredClientRequestIds: () => new Set<string>(),
  approvals: () => [],
  agentFiles: () => [],
  backendModels: () => [],
  backendCommands: () => [],
  backendSkills: () => [],
  backendCapabilities: () => defaultBackendCapabilities('codex'),
  isConversationLoading: false,
  connectionState: () => ({ status: 'connected' }),
  modelCatalogStatus: 'notLoaded',
  skillCatalogStatus: 'notLoaded',
  selectedModelId: null,
  selectedReasoningEffort: null,
  selectedServiceTier: null,
  approvalPreset: null,
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
  createAgent: async () => undefined,
  createTeam: async () => undefined,
  deployBenchTemplateAction: async () => undefined,
  updateTeam: async () => undefined,
  updateAgent: async () => undefined,
  updateSettings: async () => undefined,
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
  'deploy-bench-template': [input: string | DeployBenchTemplateInput];
  'duplicate-agent': [agentId: string];
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
  'select-team': [teamId: string];
  'steer-queued-prompt': [promptId: string];
  'update:planMode': [enabled: boolean];
  'update:composerState': [payload: { agentId: string; state: CodexComposerState }];
  'update:composerAttachments': [payload: { agentId: string; attachments: readonly CodexNativeAttachment[] }];
  'install-update': [];
  sendPrompt: [prompt: string, options?: SendPromptOptions];
  steerPrompt: [prompt: string, options?: SendPromptOptions];
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

type AppSurface = 'agent' | 'cockpit' | 'loops' | 'settings';
type BenchLoadStatus = 'notLoaded' | 'loading' | 'loaded' | 'error';
type AgentRightWorkspaceState = {
  activeTab: RightWorkspaceTab | null;
  browserId: string;
  browserInitialUrl: string;
  browserOpenRequestId: number;
  filePanels: Partial<Record<RightWorkspaceFileTab, RightWorkspaceFilePanel>>;
  filePreviewRequestIds: Partial<Record<RightWorkspaceFileTab, number>>;
  diffPanels: Partial<Record<RightWorkspaceDiffTab, RightWorkspaceDiffPanel>>;
  gitReviewPanel: SidePanelGitDiffState | null;
  open: boolean;
  tabs: RightWorkspaceTab[];
  width: number;
};

const agentSidebarCollapsed = ref(false);
const agentListCompact = computed(() => props.snapshot.general.agentListCompact);
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
const executionPlanStates = reactive<Record<string, { open: boolean; turnId: string }>>({});
const workspaceBody = ref<HTMLElement | null>(null);
const conversationPane = ref<{ focusComposer(): void } | null>(null);
const authentication = ref<CodexAuthentication | null>(null);
const authenticationLoading = ref(true);
const authenticationCancelling = ref(false);
const authenticationError = ref<string | null>(null);
let authenticationPoll: ReturnType<typeof setInterval> | null = null;
const settingsActiveTab = ref<SettingsTab>('chatgpt');
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
const editingTeamId = ref<string | null>(null);
const sidePanel = ref<SidePanelState | null>(null);
let sidePanelRequestId = 0;
let filePreviewRequestId = 0;
let markdownPreviewId = 0;
let unsubscribeAppCommand: (() => void) | null = null;
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
const currentTurnPlan = computed<ThreadPlan | null>(() => {
  const plan = currentAgent.value?.plan;
  if (!plan?.steps.length) {
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
  return Boolean(agentId && rightWorkspaceFor(agentId).open && sidePanel.value === null);
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
const isModalDialogVisible = computed(() => agentDialogVisible.value || benchAssignmentDialogVisible.value || teamDialogVisible.value);
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
const isPlanPreviewUpdating = computed(() => {
  if (sidePanel.value?.kind !== 'markdown' || sidePanel.value.purpose !== 'plan') {
    return false;
  }

  const agentId = currentAgent.value?.id;
  if (!agentId) {
    return false;
  }

  return props.messages.some((message) => (
    message.agentId === agentId &&
    message.parts.some((part) => (
      part.type === 'tool' &&
      part.status === 'running' &&
      part.metadata?.planProgress === true
    ))
  ));
});

onMounted(() => {
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', handleShellShortcut);
  }
  unsubscribeAppCommand = window.codexClaw?.onAppCommand?.(handleAppCommand) ?? null;
  void loadAuthentication();
});

onBeforeUnmount(() => {
  if (typeof window.removeEventListener === 'function') {
    window.removeEventListener('keydown', handleShellShortcut);
  }
  unsubscribeAppCommand?.();
  unsubscribeAppCommand = null;
  stopAuthenticationPolling();
});

async function loadAuthentication(): Promise<void> {
  authenticationLoading.value = true;
  authenticationError.value = null;
  try {
    if (!window.codexClaw) {
      authentication.value = {
        account: { type: 'apiKey' },
        requiresOpenaiAuth: false,
        login: { status: 'idle', error: null },
      };
      return;
    }
    authentication.value = await window.codexClaw.getCodexAuthentication();
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
    const api = window.codexClaw;
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
    const api = window.codexClaw;
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
  const api = window.codexClaw;
  if (!api) throw new Error('Codex Claw API is unavailable.');
  authentication.value = await api.logoutCodex();
}

function startAuthenticationPolling(): void {
  stopAuthenticationPolling();
  const api = window.codexClaw;
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
    browserId: PRIMARY_BROWSER_ID,
    browserInitialUrl: '',
    browserOpenRequestId: 0,
    filePanels: {},
    filePreviewRequestIds: {},
    diffPanels: {},
    gitReviewPanel: null,
    open: false,
    tabs: [],
    width: 420,
  };
  rightWorkspaces[agentId] = created;
  return created;
}

function isRightWorkspaceVisible(agentId: string): boolean {
  return currentAgent.value?.id === agentId && rightWorkspaceFor(agentId).open && sidePanel.value === null;
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

  closeSidePanel();
  workspace.open = true;
}

function openRightWorkspaceTab(tab: RightWorkspaceTab, agentId = currentAgent.value?.id): void {
  if (!agentId) return;
  if (agentId === currentAgent.value?.id) closeSidePanel();
  const workspace = rightWorkspaceFor(agentId);
  if (!workspace.tabs.includes(tab)) {
    workspace.tabs = [...workspace.tabs, tab];
  }
  workspace.activeTab = tab;
  workspace.open = true;
}

function openRequestedBrowser(agentId: string, command: Extract<AppCommand, { type: 'open-browser' }>): void {
  const workspace = rightWorkspaceFor(agentId);
  workspace.browserId = command.browserId ?? PRIMARY_BROWSER_ID;
  workspace.browserInitialUrl = command.url ?? '';
  workspace.browserOpenRequestId += 1;
  openRightWorkspaceTab('browser', agentId);
}

function handleBrowserOpenCommand(command: Extract<AppCommand, { type: 'open-browser' }>): void {
  const agentId = command.agentId ?? currentAgent.value?.id;
  if (!agentId || !props.snapshot.agents.some((agent) => agent.id === agentId)) return;
  openRequestedBrowser(agentId, command);
}

function openRightWorkspaceTabFromMenu(agentId: string, tab: RightWorkspaceTab): void {
  if (tab === 'review') {
    void openAgentGitDiffPreview(agentId);
    return;
  }
  openRightWorkspaceTab(tab, agentId);
}

function selectRightWorkspaceTab(agentId: string, tab: RightWorkspaceTab): void {
  const workspace = rightWorkspaceFor(agentId);
  if (workspace.tabs.includes(tab)) {
    if (agentId === currentAgent.value?.id) closeSidePanel();
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
  closeSidePanel();
  activeSurface.value = 'cockpit';
}

function openLoops(): void {
  closeSidePanel();
  activeSurface.value = 'loops';
}

function openSettings(): void {
  closeSidePanel();
  activeSurface.value = 'settings';
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

function closeSidePanel(): void {
  sidePanelRequestId += 1;
  sidePanel.value = null;
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
  emit('resolve-approval', approvalId, decision, scope);
}

function forwardPrompt(prompt: string, options?: SendPromptOptions): void {
  if (options) {
    emit('sendPrompt', prompt, options);
  } else {
    emit('sendPrompt', prompt);
  }
}

function forwardSteerPrompt(prompt: string, options?: SendPromptOptions): void {
  if (options) {
    emit('steerPrompt', prompt, options);
  } else {
    emit('steerPrompt', prompt);
  }
}

function cancelPlanReview(): void {
  emit('update:planMode', false);
  closeSidePanel();
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
  if (reveal) openRightWorkspaceTab(tab, agent.id);

  try {
    const result = await props.previewAgentFile(agent.id, trimmedPath);
    if (workspace.filePreviewRequestIds[tab] !== requestId) {
      return;
    }
    workspace.filePanels = {
      ...workspace.filePanels,
      [tab]: filePreviewPanel(result.path, result.content, 'idle', null),
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

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'g' && currentAgent.value) {
    event.preventDefault();
    void openAgentGitDiffPreview();
    return;
  }

  if (event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b' && currentAgent.value) {
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

function handleAppCommand(command: AppCommand): void {
  if (command.type === 'set-agent-list-compact') {
    void updateSettings({ general: { agentListCompact: command.compact } });
    return;
  }

  if (command.type === 'open-browser' && command.agentId && command.url) {
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

  if (isModalDialogVisible.value) {
    return;
  }

  if (command.type === 'quit') {
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

async function updateSettings(input: UpdateSettingsInput): Promise<void> {
  await props.updateSettings(input);
}

async function getPluginStatus(): Promise<import('@codex-claw/shared/contracts').AppPluginStatus> {
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
    return '';
  }

  if (!normalizedPath.startsWith(`${normalizedFolder}/`)) {
    return '';
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

watch(() => currentAgent.value?.id ?? null, () => {
  closeSidePanel();
});

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
  if (request.purpose !== 'plan') {
    const agent = currentAgent.value;
    if (!agent) return;
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

  sidePanelRequestId += 1;
  const subtitle = request.path;
  sidePanel.value = {
    kind: 'markdown',
    ...(request.purpose ? { purpose: request.purpose } : {}),
    title: request.title ?? (subtitle ? fileBasename(subtitle) : 'Markdown'),
    ...(subtitle ? { subtitle } : {}),
    content: request.content,
    state: 'idle',
    error: null,
  };
}

function openGitDiffRequest(request: Extract<SidePanelRequest, { kind: 'gitDiff' }>): void {
  if (request.scope === 'turn') {
    return;
  }

  const agentId = currentAgent.value?.id;
  if (!agentId) return;
  sidePanelRequestId += 1;
  rightWorkspaceFor(agentId).gitReviewPanel = {
    kind: 'gitDiff',
    title: request.title ?? 'Review',
    ...(request.subtitle ? { subtitle: request.subtitle } : {}),
    diff: request.diff,
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
