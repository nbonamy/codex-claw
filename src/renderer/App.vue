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
    :side-panel-markdown-request="sidePanelMarkdownRequest"
    :choose-agent-folder="chooseAgentFolder"
    :read-agent-file="readAgentFile"
    :create-agent="createAgent"
    :create-team="createTeam"
    :update-team="updateTeam"
    :update-agent="updateAgent"
    :update-settings="updateSettings"
    :quit="quit"
    @close-team="closeTeam"
    @close-agent="closeAgent"
    @duplicate-agent="duplicateAgent"
    @move-agent-to-team="moveAgentToTeam"
    @reorder-agents="reorderAgents"
    @reorder-teams="reorderTeams"
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
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue';
import AppShell from './components/AppShell.vue';
import { useAppState } from './app-state';
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
  sidePanelMarkdownRequest,
  loadBackendModels,
  loadSnapshot,
  chooseAgentFolder,
  readAgentFile,
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
