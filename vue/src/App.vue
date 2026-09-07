<template>
  <AppShell
    :inert="backendRestartInProgress || pendingSessionCompression !== null ? '' : undefined"
    :aria-hidden="backendRestartInProgress || pendingSessionCompression !== null ? 'true' : undefined"
    :snapshot="snapshot"
    :active-agent="activeAgent"
    :unread-agent-ids="unreadAgentIds"
    :codex-conversation-snapshot="activeCodexConversationSnapshot"
    :claude-conversation-snapshot="activeClaudeConversationSnapshot"
    :is-loading="isLoading"
    :is-conversation-loading="isHydratingActiveAgentHistory"
    :is-conversation-load-failed="isActiveAgentHistoryFailed"
    :retry-agent-history="retryActiveAgentHistory"
    :send-prompt-action="sendPromptWithCompression"
    :delete-turn-action="deleteTurn"
    :edit-turn-action="editTurn"
    :retry-turn-action="retryTurn"
    :history-has-older="activeHistoryHasOlder"
    :history-loading-older="isLoadingOlderHistory"
    :load-older-agent-history="loadOlderAgentHistory"
    :is-sending="isSending"
    :connection-state="connectionState"
    :answered-client-request-ids="answeredClientRequestIds"
    :agent-files="agentFiles"
    :backend-models="backendModels"
    :backend-commands="activeBackendCommands"
    :backend-plugins="backendPlugins"
    :backend-skills="backendSkills"
    :backend-capabilities="activeBackendCapabilities"
    :model-catalog-status="modelCatalogStatus"
    :skill-catalog-status="skillCatalogStatus"
    :goal="activeGoal"
    :approvals="activeBackendApprovals"
    :approval-preset="activeApprovalPreset"
    :permission-mode="activePermissionMode"
    :plan-mode="planMode"
    :selected-model-id="selectedModelId"
    :selected-reasoning-effort="selectedReasoningEffort"
    :selected-service-tier="selectedServiceTier"
    :queued-prompts="activeQueuedPrompts"
    :composer-state="activeComposerState"
    :composer-attachments="activeComposerAttachments"
    :update-status="updateStatus"
    :side-panel-request="sidePanelRequest"
    :file-activity="fileActivity"
    :work-provider-authorization="workProviderAuthorization"
    :work-repositories-by-provider="workRepositoriesByProvider"
    :work-items-by-repository="workItemsByRepository"
    :assigned-work-items-by-provider="assignedWorkItemsByProvider"
    :work-backlog-status="workBacklogStatus"
    :work-backlog-error="workBacklogError"
    :daemon-status="daemonStatus"
    :daemon-status-error="daemonStatusError"
    :codex-resource-sharing-migration-required="codexResourceSharingStatus.migrationRequired"
    :source-repositories="sourceRepositories"
    :choose-agent-folder="chooseAgentFolder"
    :choose-codex-binary="chooseCodexBinary"
    :choose-source-folder="chooseSourceFolder"
    :list-source-folders="listSourceFolders"
    :list-source-repositories="listSourceRepositories"
    :clone-source-repository="cloneSourceRepository"
    :list-source-branches="listSourceBranches"
    :list-source-worktrees="listSourceWorktrees"
    :suggest-source-worktree-path="suggestSourceWorktreePath"
    :choose-source-worktree-destination="chooseSourceWorktreeDestination"
    :create-source-worktree="createSourceWorktree"
    :preview-agent-file="previewAgentFile"
    :open-agent-git-diff="openAgentGitDiff"
    :get-agent-git-workflow="getAgentGitWorkflow"
    :generate-agent-git-message="generateAgentGitMessage"
    :stage-agent-git-files="stageAgentGitFiles"
    :commit-agent-git-changes="commitAgentGitChanges"
    :push-agent-git-branch="pushAgentGitBranch"
    :create-agent-git-branch="createAgentGitBranch"
    :create-agent-git-pull-request="createAgentGitPullRequest"
    :merge-agent-git-branch="mergeAgentGitBranch"
    :open-in-applications="openInApplications"
    :open-agent-path="openAgentPath"
    :create-agent="createAgent"
    :create-quick-chat="createQuickChat"
    :create-team="createTeam"
    :update-team="updateTeam"
    :update-agent="updateAgent"
    :update-settings="updateSettings"
    :set-codex-resource-sharing="setCodexResourceSharing"
    :get-plugin-status="getPluginStatus"
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
    :set-daemon-enabled="setDaemonEnabled"
    :connect-work-provider="connectWorkProvider"
    :open-work-provider-authorization="openWorkProviderAuthorization"
    :complete-work-provider-connection="completeWorkProviderConnection"
    :disconnect-work-provider="disconnectWorkProvider"
    :get-automation-snapshot="getAutomationSnapshot"
    :create-automation="createAutomation"
    :update-automation="updateAutomation"
    :run-automation="runAutomation"
    :clear-automation-history="clearAutomationHistory"
    :delete-automation-execution="deleteAutomationExecution"
    :delete-automation="deleteAutomation"
    :list-agent-conversations="listAgentConversations"
    :resume-agent-conversation="resumeAgentConversation"
    :read-conversation-messages="readConversationMessages"
    :configure-work-backlog="configureWorkBacklog"
    :load-work-repositories="loadWorkRepositories"
    :load-work-items="loadWorkItems"
    :load-global-work-items="loadGlobalWorkItems"
    :load-assigned-work-items="loadAssignedWorkItems"
    :duplicate-agent-action="duplicateAgent"
    :assign-work-item-action="assignWorkItemToAgent"
    :quit="quit"
    :restart-app="restartApp"
    @close-team="closeTeam"
    @disconnect-team="disconnectTeam"
    @close-agent="requestCloseAgent"
    @compress-session="requestSessionCompression"
    @cleanup-pull-request="requestPullRequestCleanup"
    @duplicate-agent="duplicateAgent"
    @fork-agent="forkAgent"
    @fork-turn="forkActiveAgentTurn"
    @move-agent-to-team="moveAgentToTeam"
    @reorder-agents="reorderAgents"
    @reorder-repositories="reorderRepositories"
    @reorder-teams="reorderTeams"
    @assign-work-item="assignWorkItemToAgent"
    @remove-work-item-assignment="removeWorkItemAssignment"
    @restart-agent="restartAgent"
    @select-agent="selectAgent"
    @select-team="selectTeam"
    @select-model="selectModel"
    @select-reasoning-effort="selectReasoningEffort"
    @select-service-tier="selectServiceTier"
    @select-approval-preset="setApprovalPreset"
    @select-permission-mode="setPermissionMode"
    @resolve-approval="resolveBackendApproval"
    @update:plan-mode="setPlanMode"
    @clear-goal="clearActiveGoal"
    @client-response="respondToClientRequest"
    @delete-queued-prompt="removeQueuedPrompt"
    @debug-mark-unread="markDebugAgentsUnread"
    @interrupt-agent="interruptActiveAgent"
    @send-agent-prompt="sendAgentPrompt($event.agentId, $event.prompt)"
    @send-prompt="sendPromptWithCompression"
    @steer-prompt="steerPrompt"
    @steer-queued-prompt="steerQueuedPrompt"
    @update-queued-prompt="updateQueuedPrompt"
    @update:composer-state="updateComposerState($event.agentId, $event.state)"
    @update:composer-attachments="updateComposerAttachments($event.agentId, $event.attachments)"
    @install-update="installUpdate"
  />
  <AgentCloseDialog
    :visible="pendingAgentClose !== null"
    :agent="pendingAgentClose?.agent"
    :workflow="pendingAgentClose?.workflow"
    :busy="agentCloseBusy"
    :error="agentCloseError"
    @close="cancelAgentClose"
    @keep-worktree="confirmAgentClose(false)"
    @delete-worktree="confirmAgentClose(true, $event)"
  />
  <SessionCompressionDialog
    :visible="pendingSessionCompression !== null"
    :busy="sessionCompressionBusy"
    :error="sessionCompressionError"
    @close="cancelSessionCompression"
    @confirm="confirmSessionCompression"
  />
  <PullRequestCleanupDialog
    :visible="pendingPullRequestCleanup !== null"
    :agent="pendingPullRequestCleanup"
    :busy="pullRequestCleanupBusy"
    :error="pullRequestCleanupError"
    @close="cancelPullRequestCleanup"
    @confirm="confirmPullRequestCleanup"
  />
  <AgentCreationProgressDialog
    :progress="agentCreationProgress"
    @close="clearAgentCreationProgress"
  />
  <ConfettiOverlay />
  <Transition name="backend-restart-overlay">
    <div
      v-if="backendRestartInProgress"
      class="backend-restart-overlay"
      data-testid="backend-restart-overlay"
      role="status"
      aria-live="assertive"
      aria-busy="true"
    >
      <div class="backend-restart-overlay__card">
        <span class="backend-restart-overlay__spinner" aria-hidden="true" />
        <div class="backend-restart-overlay__copy">
          <strong>{{ $t('surface.app.applyingResourceChanges') }}</strong>
          <span>{{ $t('surface.app.restartingTheBackendAndReconnectingYourChats') }}</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Agent, AgentGitWorkflow, DesktopUpdateStatus, RendererSendPromptOptions } from '@codex-claw/core/contracts';
import AppShell from './components/AppShell.vue';
import AgentCloseDialog from './components/AgentCloseDialog.vue';
import PullRequestCleanupDialog from './components/PullRequestCleanupDialog.vue';
import AgentCreationProgressDialog from './components/AgentCreationProgressDialog.vue';
import SessionCompressionDialog from './components/SessionCompressionDialog.vue';
import { useAppState } from './app-state';
import ConfettiOverlay from './shared/confetti/ConfettiOverlay.vue';
import { applyAppTheme, subscribeToSystemAppearance } from './theme/apply-theme';
import { clawHostCapabilities, codexClawApi } from './platform-api';
import { localizedErrorMessage } from './i18n/errors';

const { t } = useI18n();

const {
  snapshot,
  activeAgent,
  activeGoal,
  activeBackendApprovals,
  activeApprovalPreset,
  activePermissionMode,
  activeQueuedPrompts,
  activeComposerState,
  activeComposerAttachments,
  unreadAgentIds,
  isLoading,
  isActiveAgentHistoryFailed,
  isHydratingActiveAgentHistory,
  retryActiveAgentHistory,
  activeHistoryHasOlder,
  isLoadingOlderHistory,
  isSending,
  connectionState,
  answeredClientRequestIds,
  agentFiles,
  backendModels,
  activeBackendCommands,
  activeCodexConversationSnapshot,
  activeClaudeConversationSnapshot,
  backendPlugins,
  activeBackendCapabilities,
  modelCatalogStatus,
  backendSkills,
  skillCatalogStatus,
  selectedModelId,
  selectedReasoningEffort,
  selectedServiceTier,
  planMode,
  sidePanelRequest,
  fileActivity,
  workProviderAuthorization,
  workRepositoriesByProvider,
  workItemsByRepository,
  assignedWorkItemsByProvider,
  workBacklogStatus,
  workBacklogError,
  daemonStatus,
  daemonStatusError,
  codexResourceSharingStatus,
  backendRestartInProgress,
  agentCreationProgress,
  sourceRepositories,
  openInApplications,
  loadBackendModels,
  loadSnapshot,
  loadOlderAgentHistory,
  chooseAgentFolder,
  chooseCodexBinary,
  chooseSourceFolder,
  listSourceFolders,
  listSourceRepositories,
  cloneSourceRepository,
  listSourceBranches,
  listSourceWorktrees,
  suggestSourceWorktreePath,
  chooseSourceWorktreeDestination,
  createSourceWorktree,
  previewAgentFile,
  openAgentGitDiff,
  getAgentGitWorkflow,
  generateAgentGitMessage,
  stageAgentGitFiles,
  commitAgentGitChanges,
  pushAgentGitBranch,
  createAgentGitBranch,
  createAgentGitPullRequest,
  mergeAgentGitBranch,
  loadOpenInApplications,
  openAgentPath,
  createAgent,
  clearAgentCreationProgress,
  createQuickChat,
  createTeam,
  updateTeam,
  reorderTeams,
  closeTeam,
  disconnectTeam,
  updateAgent,
  duplicateAgent,
  forkAgent,
  forkActiveAgentTurn,
  moveAgentToTeam,
  reorderAgents,
  reorderRepositories,
  restartAgent,
  closeAgent: closeAgentAction,
  updateSettings,
  setCodexResourceSharing,
  listSshHosts,
  addSshConnection,
  checkRemoteConnection,
  updateRemoteConnection,
  removeRemoteConnection,
  getDevicePairingStatus,
  enableDevicePairing,
  disableDevicePairing,
  startDevicePairing,
  checkDevicePairing,
  listPairedDevices,
  revokePairedDevice,
  setDaemonEnabled,
  connectWorkProvider,
  openWorkProviderAuthorization,
  completeWorkProviderConnection,
  disconnectWorkProvider,
  getAutomationSnapshot,
  createAutomation,
  updateAutomation,
  runAutomation,
  clearAutomationHistory,
  deleteAutomationExecution,
  deleteAutomation,
  listAgentConversations,
  resumeAgentConversation,
  compressAgentSession,
  readConversationMessages,
  configureWorkBacklog,
  loadWorkRepositories,
  loadWorkItems,
  loadGlobalWorkItems,
  loadAssignedWorkItems,
  assignWorkItemToAgent,
  removeWorkItemAssignment,
  resolveBackendApproval,
  respondToClientRequest,
  selectModel,
  selectReasoningEffort,
  selectServiceTier,
  setApprovalPreset,
  setPermissionMode,
  updateComposerState,
  updateComposerAttachments,
  setPlanMode,
  clearActiveGoal,
  selectAgent,
  setRendererWindowFocused,
  markDebugAgentsUnread,
  selectTeam,
  sendPrompt,
  sendAgentPrompt,
  steerPrompt,
  interruptActiveAgent,
  deleteTurn,
  editTurn,
  retryTurn,
  steerQueuedPrompt,
  updateQueuedPrompt,
  removeQueuedPrompt,
  quit,
  restartApp,
  getPluginStatus,
} = useAppState();

const updateStatus = ref<DesktopUpdateStatus>({ state: 'idle' });
const pendingAgentClose = ref<{ agent: Agent; workflow: AgentGitWorkflow } | null>(null);
const agentCloseBusy = ref(false);
const agentCloseError = ref<string | null>(null);
const pendingPullRequestCleanup = ref<Agent | null>(null);
const pullRequestCleanupBusy = ref(false);
const pullRequestCleanupError = ref<string | null>(null);
const pendingSessionCompression = ref<Agent | null>(null);
const sessionCompressionBusy = ref(false);
const sessionCompressionError = ref<string | null>(null);
let unsubscribeSystemAppearance: (() => void) | null = null;
let unsubscribeUpdateStatus: (() => void) | null = null;

async function installUpdate(): Promise<void> {
  await codexClawApi?.installUpdate?.();
}

async function requestCloseAgent(agentId: string): Promise<void> {
  const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
  if (!agent) return;
  try {
    const workflow = await getAgentGitWorkflow(agentId);
    if (workflow.isLinkedWorktree) {
      pendingAgentClose.value = { agent, workflow };
      agentCloseError.value = null;
      return;
    }
  } catch {
    // Non-Git folders and unavailable Git hosts use the normal close behavior.
  }
  await closeAgentAction(agentId);
}

function cancelAgentClose(): void {
  if (agentCloseBusy.value) return;
  pendingAgentClose.value = null;
  agentCloseError.value = null;
}

async function confirmAgentClose(deleteWorktree: boolean, deleteRemoteBranch = false): Promise<void> {
  const pending = pendingAgentClose.value;
  if (!pending || agentCloseBusy.value) return;
  agentCloseBusy.value = true;
  agentCloseError.value = null;
  try {
    await closeAgentAction(pending.agent.id, deleteWorktree ? {
      deleteWorktree: true,
      deleteRemoteBranch,
      confirmed: true,
    } : undefined);
    pendingAgentClose.value = null;
  } catch (error) {
    agentCloseError.value = error instanceof Error ? error.message : String(error);
  } finally {
    agentCloseBusy.value = false;
  }
}

function requestPullRequestCleanup(agentId: string): void {
  const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
  if (agent?.pullRequest?.state !== 'merged' && agent?.pullRequest?.state !== 'closed') return;
  pendingPullRequestCleanup.value = agent;
  pullRequestCleanupError.value = null;
}

function cancelPullRequestCleanup(): void {
  if (pullRequestCleanupBusy.value) return;
  pendingPullRequestCleanup.value = null;
  pullRequestCleanupError.value = null;
}

async function confirmPullRequestCleanup(): Promise<void> {
  const agent = pendingPullRequestCleanup.value;
  if (!agent || pullRequestCleanupBusy.value) return;
  pullRequestCleanupBusy.value = true;
  pullRequestCleanupError.value = null;
  try {
    await closeAgentAction(agent.id, {
      deleteWorktree: true,
      pullRequestCleanup: true,
      confirmed: true,
    });
    pendingPullRequestCleanup.value = null;
  } catch (error) {
    pullRequestCleanupError.value = localizedErrorMessage(error, t);
  } finally {
    pullRequestCleanupBusy.value = false;
  }
}

function requestSessionCompression(agentId: string): void {
  if (sessionCompressionBusy.value) return;
  const agent = snapshot.value.agents.find((candidate) => candidate.id === agentId);
  if (
    !agent ||
    agent.backend !== 'codex' ||
    agent.backendSession?.kind !== 'codex' ||
    agent.status.type !== 'idle'
  ) {
    return;
  }
  pendingSessionCompression.value = agent;
  sessionCompressionError.value = null;
  if (!snapshot.value.general.sessionCompressionWarningEnabled) {
    void confirmSessionCompression(false);
  }
}

function cancelSessionCompression(): void {
  if (sessionCompressionBusy.value) return;
  pendingSessionCompression.value = null;
  sessionCompressionError.value = null;
}

async function confirmSessionCompression(dontShowAgain: boolean): Promise<void> {
  const agent = pendingSessionCompression.value;
  if (!agent || sessionCompressionBusy.value) return;
  sessionCompressionBusy.value = true;
  sessionCompressionError.value = null;
  try {
    if (dontShowAgain && snapshot.value.general.sessionCompressionWarningEnabled) {
      await updateSettings({ general: { sessionCompressionWarningEnabled: false } }).catch(() => undefined);
    }
    await compressAgentSession(agent.id);
    pendingSessionCompression.value = null;
  } catch (error) {
    sessionCompressionError.value = localizedErrorMessage(error, t);
  } finally {
    sessionCompressionBusy.value = false;
  }
}

async function sendPromptWithCompression(prompt: string, options?: RendererSendPromptOptions): Promise<void> {
  const agent = activeAgent.value;
  if (prompt.trim() === '/compact' && agent?.backend === 'codex') {
    requestSessionCompression(agent.id);
    return;
  }
  await sendPrompt(prompt, options);
}

function syncRendererWindowFocus(): void {
  setRendererWindowFocused(document.visibilityState === 'visible' && document.hasFocus());
}

onMounted(() => {
  window.addEventListener('focus', syncRendererWindowFocus);
  window.addEventListener('blur', syncRendererWindowFocus);
  document.addEventListener('visibilitychange', syncRendererWindowFocus);
  syncRendererWindowFocus();
  unsubscribeSystemAppearance = subscribeToSystemAppearance();
  void loadSnapshot();
  void loadBackendModels();
  void loadOpenInApplications();
  const updateStatusPromise = clawHostCapabilities.appUpdates
    ? codexClawApi?.getUpdateStatus?.()
    : undefined;
  if (updateStatusPromise) {
    void updateStatusPromise.then((status) => {
      updateStatus.value = status;
    });
  }
  unsubscribeUpdateStatus = clawHostCapabilities.appUpdates
    ? codexClawApi?.onUpdateStatusChanged?.((status) => {
      updateStatus.value = status;
    }) ?? null
    : null;
});

onBeforeUnmount(() => {
  window.removeEventListener('focus', syncRendererWindowFocus);
  window.removeEventListener('blur', syncRendererWindowFocus);
  document.removeEventListener('visibilitychange', syncRendererWindowFocus);
  unsubscribeSystemAppearance?.();
  unsubscribeSystemAppearance = null;
  unsubscribeUpdateStatus?.();
  unsubscribeUpdateStatus = null;
});

watch(() => snapshot.value.theme, (theme) => {
  applyAppTheme(theme);
}, { deep: true, immediate: true });
</script>

<style scoped>
.backend-restart-overlay {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: var(--space-12);
  background: var(--color-overlay);
  backdrop-filter: blur(6px);
}

.backend-restart-overlay__card {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  width: min(420px, 100%);
  padding: var(--space-8);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
  box-shadow: var(--shadow-lg);
}

.backend-restart-overlay__spinner {
  width: var(--space-10);
  height: var(--space-10);
  flex: 0 0 auto;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: backend-restart-spin 0.8s linear infinite;
}

.backend-restart-overlay__copy {
  display: grid;
  gap: var(--space-1);
  color: var(--color-text);
}

.backend-restart-overlay__copy strong {
  font-size: var(--font-size-16);
  line-height: var(--line-height-22);
}

.backend-restart-overlay__copy span {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.backend-restart-overlay-enter-active,
.backend-restart-overlay-leave-active {
  transition: opacity 120ms ease;
}

.backend-restart-overlay-enter-from,
.backend-restart-overlay-leave-to {
  opacity: 0;
}

@keyframes backend-restart-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .backend-restart-overlay__spinner {
    animation: none;
  }
}
</style>
