<template>
  <AppShell
    :snapshot="snapshot"
    :active-agent="activeAgent"
    :messages="visibleMessages"
    :is-loading="isLoading"
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
  loadSnapshot,
} = useAppState();

onMounted(() => {
  void loadSnapshot();
});
</script>
