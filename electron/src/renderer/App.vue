<template>
  <AppShell
    :snapshot="snapshot"
    :active-agent="activeAgent"
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
    :create-agent="createAgent"
    :create-team="createTeam"
    :deploy-bench-template-action="deployBenchTemplate"
    :update-team="updateTeam"
    :update-agent="updateAgent"
    :update-settings="updateSettings"
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
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { DesktopUpdateStatus } from '@codex-claw/shared/contracts';
import AppShell from './components/AppShell.vue';
import { useAppState } from './app-state';
import ConfettiOverlay from './shared/confetti/ConfettiOverlay.vue';
import { applyAppTheme, subscribeToSystemAppearance } from './theme/apply-theme';

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
  sourceRepositories,
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
  createAgent,
  createTeam,
  updateTeam,
  reorderTeams,
  closeTeam,
  disconnectTeam,
  updateAgent,
  duplicateAgent,
  moveAgentToTeam,
  reorderAgents,
  saveAgentToBench,
  deployBenchTemplate,
  removeBenchTemplate,
  restartAgent,
  closeAgent,
  updateSettings,
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
  await window.codexClaw?.installUpdate?.();
}

onMounted(() => {
  unsubscribeSystemAppearance = subscribeToSystemAppearance();
  void loadSnapshot();
  void loadBackendModels();
  const updateStatusPromise = window.codexClaw?.getUpdateStatus?.();
  if (updateStatusPromise) {
    void updateStatusPromise.then((status) => {
      updateStatus.value = status;
    });
  }
  unsubscribeUpdateStatus = window.codexClaw?.onUpdateStatusChanged?.((status) => {
    updateStatus.value = status;
  }) ?? null;
});

onBeforeUnmount(() => {
  unsubscribeSystemAppearance?.();
  unsubscribeSystemAppearance = null;
  unsubscribeUpdateStatus?.();
  unsubscribeUpdateStatus = null;
});

watch(() => snapshot.value.theme, (theme) => {
  applyAppTheme(theme);
}, { deep: true, immediate: true });
</script>
