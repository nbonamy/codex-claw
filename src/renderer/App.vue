<template>
  <AppShell
    :snapshot="snapshot"
    :active-agent="activeAgent"
    :messages="visibleMessages"
    :is-loading="isLoading"
    :is-sending="isSending"
    @select-agent="selectAgent"
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
  loadSnapshot,
  selectAgent,
  sendPrompt,
} = useAppState();

onMounted(() => {
  void loadSnapshot();
});
</script>
