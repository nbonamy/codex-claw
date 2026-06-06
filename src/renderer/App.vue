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
    :selected-model-id="selectedModelId"
    :selected-reasoning-effort="selectedReasoningEffort"
    :choose-agent-folder="chooseAgentFolder"
    :create-agent="createAgent"
    :create-team="createTeam"
    :update-agent="updateAgent"
    @close-agent="closeAgent"
    @duplicate-agent="duplicateAgent"
    @restart-agent="restartAgent"
    @save-agent-to-bench="saveAgentToBench"
    @select-agent="selectAgent"
    @select-team="selectTeam"
    @select-model="selectModel"
    @select-reasoning-effort="selectReasoningEffort"
    @client-response="respondToClientRequest"
    @send-prompt="sendPrompt"
  />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import AppShell from './components/AppShell.vue';
import { useAppState } from './app-state';

const {
  snapshot,
  activeAgent,
  visibleMessages,
  isLoading,
  isSending,
  answeredClientRequestIds,
  codexModels,
  modelCatalogStatus,
  selectedModelId,
  selectedReasoningEffort,
  loadCodexModels,
  loadSnapshot,
  chooseAgentFolder,
  createAgent,
  createTeam,
  updateAgent,
  duplicateAgent,
  saveAgentToBench,
  restartAgent,
  closeAgent,
  respondToClientRequest,
  selectModel,
  selectReasoningEffort,
  selectAgent,
  selectTeam,
  sendPrompt,
} = useAppState();

onMounted(() => {
  void loadSnapshot();
  void loadCodexModels();
});
</script>
