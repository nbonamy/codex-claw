<template>
  <SettingsPanelFrame
    title="General"
    title-id="settings-general-title"
  >
    <p class="settings-general-panel__empty">No general settings yet.</p>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import SettingsPanelFrame from './SettingsPanelFrame.vue';
</script>

<style scoped>
.settings-general-panel__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}
</style>
