<template>
  <AppShell
    :inert="backendRestartInProgress ? '' : undefined"
    :aria-hidden="backendRestartInProgress ? 'true' : undefined"
    :snapshot="snapshot"
    :active-agent="activeAgent"
    :unread-agent-ids="unreadAgentIds"
    :messages="visibleMessages"
    :is-loading="isLoading"
    :is-conversation-loading="isHydratingActiveAgentHistory"
    :history-has-older="activeHistoryHasOlder"
    :history-loading-older="isLoadingOlderHistory"
    :load-older-agent-history="loadOlderAgentHistory"
    :is-sending="isSending"
    :connection-state="connectionState"
    :answered-client-request-ids="answeredClientRequestIds"
    :agent-files="agentFiles"
    :backend-models="backendModels"
    :backend-commands="activeBackendCommands"
    :backend-skills="backendSkills"
    :backend-capabilities="activeBackendCapabilities"
    :model-catalog-status="modelCatalogStatus"
    :skill-catalog-status="skillCatalogStatus"
    :goal="activeGoal"
    :approvals="activeBackendApprovals"
    :approval-preset="activeApprovalPreset"
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
    :work-backlog-status="workBacklogStatus"
    :work-backlog-error="workBacklogError"
    :remote-bench-by-connection-id="remoteBenchByConnectionId"
    :remote-bench-status-by-connection-id="remoteBenchStatusByConnectionId"
    :remote-bench-error-by-connection-id="remoteBenchErrorByConnectionId"
    :daemon-status="daemonStatus"
    :daemon-status-error="daemonStatusError"
    :codex-resource-sharing-migration-required="codexResourceSharingStatus.migrationRequired"
    :source-repositories="sourceRepositories"
    :choose-agent-folder="chooseAgentFolder"
    :choose-codex-binary="chooseCodexBinary"
    :choose-source-folder="chooseSourceFolder"
    :list-source-folders="listSourceFolders"
    :list-source-repositories="listSourceRepositories"
    :list-source-worktrees="listSourceWorktrees"
    :suggest-source-worktree-path="suggestSourceWorktreePath"
    :choose-source-worktree-destination="chooseSourceWorktreeDestination"
    :create-source-worktree="createSourceWorktree"
    :preview-agent-file="previewAgentFile"
    :open-agent-git-diff="openAgentGitDiff"
    :open-in-applications="openInApplications"
    :open-agent-path="openAgentPath"
    :create-agent="createAgent"
    :create-team="createTeam"
    :deploy-bench-template-action="deployBenchTemplate"
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
    :load-bench="loadBench"
    :get-loop-snapshot="getLoopSnapshot"
    :create-loop="createLoop"
    :update-loop="updateLoop"
    :run-loop="runLoop"
    :clear-loop-history="clearLoopHistory"
    :delete-loop-execution="deleteLoopExecution"
    :delete-loop="deleteLoop"
    :list-agent-conversations="listAgentConversations"
    :resume-agent-conversation="resumeAgentConversation"
    :read-conversation-messages="readConversationMessages"
    :configure-work-backlog="configureWorkBacklog"
    :load-work-repositories="loadWorkRepositories"
    :load-work-items="loadWorkItems"
    :quit="quit"
    :restart-app="restartApp"
    @close-team="closeTeam"
    @disconnect-team="disconnectTeam"
    @close-agent="closeAgent"
    @duplicate-agent="duplicateAgent"
    @fork-agent="forkAgent"
    @fork-message="forkActiveAgentMessage"
    @move-agent-to-team="moveAgentToTeam"
    @reorder-agents="reorderAgents"
    @reorder-teams="reorderTeams"
    @assign-work-item="assignWorkItemToAgent"
    @remove-work-item-assignment="removeWorkItemAssignment"
    @deploy-bench-template="deployBenchTemplate"
    @remove-bench-template="removeBenchTemplate"
    @restart-agent="restartAgent"
    @save-agent-to-bench="saveAgentToBench"
    @select-agent="selectAgent"
    @select-team="selectTeam"
    @select-model="selectModel"
    @select-reasoning-effort="selectReasoningEffort"
    @select-service-tier="selectServiceTier"
    @select-approval-preset="setApprovalPreset"
    @resolve-approval="resolveBackendApproval"
    @update:plan-mode="setPlanMode"
    @clear-goal="clearActiveGoal"
    @client-response="respondToClientRequest"
    @delete-queued-prompt="removeQueuedPrompt"
    @debug-mark-unread="markDebugAgentsUnread"
    @delete-message="deleteMessage"
    @edit-message="editMessage"
    @interrupt-agent="interruptActiveAgent"
    @retry-message="retryMessage"
    @send-agent-prompt="sendAgentPrompt($event.agentId, $event.prompt)"
    @send-prompt="sendPrompt"
    @steer-prompt="steerPrompt"
    @steer-queued-prompt="steerQueuedPrompt"
    @update:composer-state="updateComposerState($event.agentId, $event.state)"
    @update:composer-attachments="updateComposerAttachments($event.agentId, $event.attachments)"
    @install-update="installUpdate"
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
          <strong>Applying resource changes…</strong>
          <span>Restarting the backend and reconnecting your chats.</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DesktopUpdateStatus } from '@codex-claw/core/contracts';
import AppShell from './components/AppShell.vue';
import { useAppState } from './app-state';
import ConfettiOverlay from './shared/confetti/ConfettiOverlay.vue';
import { applyAppTheme, subscribeToSystemAppearance } from './theme/apply-theme';
import { clawHostCapabilities, codexClawApi } from './platform-api';

const {
  snapshot,
  activeAgent,
  activeGoal,
  activeBackendApprovals,
  activeApprovalPreset,
  visibleMessages,
  activeQueuedPrompts,
  activeComposerState,
  activeComposerAttachments,
  unreadAgentIds,
  isLoading,
  isHydratingActiveAgentHistory,
  activeHistoryHasOlder,
  isLoadingOlderHistory,
  isSending,
  connectionState,
  answeredClientRequestIds,
  agentFiles,
  backendModels,
  activeBackendCommands,
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
  workBacklogStatus,
  workBacklogError,
  remoteBenchByConnectionId,
  remoteBenchStatusByConnectionId,
  remoteBenchErrorByConnectionId,
  daemonStatus,
  daemonStatusError,
  codexResourceSharingStatus,
  backendRestartInProgress,
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
  listSourceWorktrees,
  suggestSourceWorktreePath,
  chooseSourceWorktreeDestination,
  createSourceWorktree,
  previewAgentFile,
  openAgentGitDiff,
  loadOpenInApplications,
  openAgentPath,
  createAgent,
  createTeam,
  updateTeam,
  reorderTeams,
  closeTeam,
  disconnectTeam,
  updateAgent,
  duplicateAgent,
  forkAgent,
  forkActiveAgentMessage,
  moveAgentToTeam,
  reorderAgents,
  saveAgentToBench,
  deployBenchTemplate,
  removeBenchTemplate,
  restartAgent,
  closeAgent,
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
  loadBench,
  getLoopSnapshot,
  createLoop,
  updateLoop,
  runLoop,
  clearLoopHistory,
  deleteLoopExecution,
  deleteLoop,
  listAgentConversations,
  resumeAgentConversation,
  readConversationMessages,
  configureWorkBacklog,
  loadWorkRepositories,
  loadWorkItems,
  assignWorkItemToAgent,
  removeWorkItemAssignment,
  resolveBackendApproval,
  respondToClientRequest,
  selectModel,
  selectReasoningEffort,
  selectServiceTier,
  setApprovalPreset,
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
  deleteMessage,
  editMessage,
  retryMessage,
  steerQueuedPrompt,
  removeQueuedPrompt,
  quit,
  restartApp,
  getPluginStatus,
} = useAppState();

const updateStatus = ref<DesktopUpdateStatus>({ state: 'idle' });
let unsubscribeSystemAppearance: (() => void) | null = null;
let unsubscribeUpdateStatus: (() => void) | null = null;

async function installUpdate(): Promise<void> {
  await codexClawApi?.installUpdate?.();
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
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .backend-restart-overlay__spinner {
    animation: none;
  }
}
</style>
