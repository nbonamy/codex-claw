<template>
  <AppShell
    :snapshot="snapshot"
    :active-agent="activeAgent"
    :messages="visibleMessages"
    :is-loading="isLoading"
    :is-sending="isSending"
    :answered-client-request-ids="answeredClientRequestIds"
    :codex-models="codexModels"
    :model-catalog-status="modelCatalogStatus"
    :goal-mode="goalMode"
    :plan-mode="planMode"
    :selected-model-id="selectedModelId"
    :selected-reasoning-effort="selectedReasoningEffort"
    :queued-prompts="activeQueuedPrompts"
    :choose-agent-folder="chooseAgentFolder"
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
    @deploy-bench-template="deployBenchTemplate"
    @remove-bench-template="removeBenchTemplate"
    @restart-agent="restartAgent"
    @save-agent-to-bench="saveAgentToBench"
    @select-agent="selectAgent"
    @select-team="selectTeam"
    @select-model="selectModel"
    @select-reasoning-effort="selectReasoningEffort"
    @update:goal-mode="setGoalMode"
    @update:plan-mode="setPlanMode"
    @client-response="respondToClientRequest"
    @delete-queued-prompt="removeQueuedPrompt"
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
  visibleMessages,
  activeQueuedPrompts,
  isLoading,
  isSending,
  answeredClientRequestIds,
  codexModels,
  modelCatalogStatus,
  selectedModelId,
  selectedReasoningEffort,
  planMode,
  goalMode,
  loadCodexModels,
  loadSnapshot,
  chooseAgentFolder,
  createAgent,
  createTeam,
  updateTeam,
  closeTeam,
  updateAgent,
  duplicateAgent,
  moveAgentToTeam,
  saveAgentToBench,
  deployBenchTemplate,
  removeBenchTemplate,
  restartAgent,
  closeAgent,
  updateSettings,
  respondToClientRequest,
  selectModel,
  selectReasoningEffort,
  setPlanMode,
  setGoalMode,
  selectAgent,
  selectTeam,
  sendPrompt,
  steerPrompt,
  steerQueuedPrompt,
  removeQueuedPrompt,
  quit,
} = useAppState();

let unsubscribeSystemAppearance: (() => void) | null = null;

onMounted(() => {
  unsubscribeSystemAppearance = subscribeToSystemAppearance();
  void loadSnapshot();
  void loadCodexModels();
});

onBeforeUnmount(() => {
  unsubscribeSystemAppearance?.();
  unsubscribeSystemAppearance = null;
});

watch(() => snapshot.value.theme, (theme) => {
  applyAppTheme(theme);
}, { deep: true, immediate: true });
</script>
