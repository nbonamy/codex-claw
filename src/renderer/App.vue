<template>
  <AppShell
    :snapshot="snapshot"
    :active-agent="activeAgent"
    :messages="visibleMessages"
    :is-loading="isLoading"
    :is-sending="isSending"
    :answered-client-request-ids="answeredClientRequestIds"
    :agent-files="agentFiles"
    :backend-models="backendModels"
    :backend-commands="activeBackendCommands"
    :backend-skills="backendSkills"
    :backend-capabilities="activeBackendCapabilities"
    :model-catalog-status="modelCatalogStatus"
    :skill-catalog-status="skillCatalogStatus"
    :goal="activeGoal"
    :codex-approval-preset="activeCodexApprovalPreset"
    :plan-mode="planMode"
    :selected-model-id="selectedModelId"
    :selected-reasoning-effort="selectedReasoningEffort"
    :queued-prompts="activeQueuedPrompts"
    :side-panel-request="sidePanelRequest"
    :work-provider-authorization="workProviderAuthorization"
    :work-repositories-by-provider="workRepositoriesByProvider"
    :work-items-by-repository="workItemsByRepository"
    :work-backlog-status="workBacklogStatus"
    :work-backlog-error="workBacklogError"
    :source-repositories="sourceRepositories"
    :choose-agent-folder="chooseAgentFolder"
    :choose-source-folder="chooseSourceFolder"
    :choose-source-worktree-destination="chooseSourceWorktreeDestination"
    :create-source-worktree="createSourceWorktree"
    :add-recent-source-repository="addRecentSourceRepository"
    :read-agent-file="readAgentFile"
    :open-agent-git-diff="openAgentGitDiff"
    :create-agent="createAgent"
    :create-team="createTeam"
    :deploy-bench-template-action="deployBenchTemplate"
    :update-team="updateTeam"
    :update-agent="updateAgent"
    :update-settings="updateSettings"
    :connect-work-provider="connectWorkProvider"
    :open-work-provider-authorization="openWorkProviderAuthorization"
    :complete-work-provider-connection="completeWorkProviderConnection"
    :disconnect-work-provider="disconnectWorkProvider"
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
    @close-team="closeTeam"
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
    @select-codex-approval-preset="setCodexApprovalPreset"
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
  />
  <ConfettiOverlay />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import AppShell from './components/AppShell.vue';
import { useAppState } from './app-state';
import ConfettiOverlay from './shared/confetti/ConfettiOverlay.vue';
import { applyAppTheme, subscribeToSystemAppearance } from './theme/apply-theme';

const {
  snapshot,
  activeAgent,
  activeGoal,
  activeCodexApprovalPreset,
  visibleMessages,
  activeQueuedPrompts,
  isLoading,
  isSending,
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
  planMode,
  sidePanelRequest,
  workProviderAuthorization,
  workRepositoriesByProvider,
  workItemsByRepository,
  workBacklogStatus,
  workBacklogError,
  sourceRepositories,
  loadBackendModels,
  loadSnapshot,
  chooseAgentFolder,
  chooseSourceFolder,
  chooseSourceWorktreeDestination,
  createSourceWorktree,
  addRecentSourceRepository,
  readAgentFile,
  openAgentGitDiff,
  createAgent,
  createTeam,
  updateTeam,
  reorderTeams,
  closeTeam,
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
  connectWorkProvider,
  openWorkProviderAuthorization,
  completeWorkProviderConnection,
  disconnectWorkProvider,
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
  respondToClientRequest,
  selectModel,
  selectReasoningEffort,
  setCodexApprovalPreset,
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
} = useAppState();

let unsubscribeSystemAppearance: (() => void) | null = null;

onMounted(() => {
  unsubscribeSystemAppearance = subscribeToSystemAppearance();
  void loadSnapshot();
  void loadBackendModels();
});

onBeforeUnmount(() => {
  unsubscribeSystemAppearance?.();
  unsubscribeSystemAppearance = null;
});

watch(() => snapshot.value.theme, (theme) => {
  applyAppTheme(theme);
}, { deep: true, immediate: true });
</script>
