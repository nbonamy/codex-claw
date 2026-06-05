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
    @select-agent="selectAgent"
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
  respondToClientRequest,
  selectModel,
  selectReasoningEffort,
  selectAgent,
  sendPrompt,
} = useAppState();

onMounted(() => {
  void loadSnapshot();
  void loadCodexModels();
});
</script>
