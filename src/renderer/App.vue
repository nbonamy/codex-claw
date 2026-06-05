<template>
  <AppShell
    :snapshot="snapshot"
    :active-agent="activeAgent"
    :messages="visibleMessages"
    :is-loading="isLoading"
    :is-sending="isSending"
    @send-prompt="sendPrompt"
    @select-agent-folder="selectAgentFolder"
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
  loadSnapshot,
  sendPrompt,
  selectAgentFolder,
} = useAppState();

onMounted(() => {
  void loadSnapshot();
});
</script>
