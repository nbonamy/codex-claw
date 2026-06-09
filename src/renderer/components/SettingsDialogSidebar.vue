<template>
  <aside
    class="settings-dialog-sidebar"
    aria-label="Settings categories"
  >
    <el-menu
      :default-active="activeTab"
      @select="selectTab"
    >
      <el-menu-item index="general">General</el-menu-item>
      <el-menu-item index="integrations">Integrations</el-menu-item>
      <el-menu-item index="appearance">Appearance</el-menu-item>
    </el-menu>
  </aside>
</template>

<script setup lang="ts">
import type { SettingsTab } from './settings-dialog-tabs';

defineProps<{
  activeTab: SettingsTab;
}>();

const emit = defineEmits<{
  select: [tab: SettingsTab];
}>();

function selectTab(tab: string): void {
  if (tab === 'general' || tab === 'appearance' || tab === 'integrations') {
    emit('select', tab);
  }
}
</script>

<style scoped>
.settings-dialog-sidebar {
  border-right: 1px solid var(--color-border);
  background: var(--color-surface-base);
}

.settings-dialog-sidebar :deep(.el-menu) {
  border-right: 0;
  background: transparent;
  padding: var(--space-8) var(--space-2);
}

.settings-dialog-sidebar :deep(.el-menu-item) {
  height: 34px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--font-size-15);
}

.settings-dialog-sidebar :deep(.el-menu-item:hover) {
  background: transparent;
}

.settings-dialog-sidebar :deep(.el-menu-item.is-active) {
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}
</style>
