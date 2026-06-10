<template>
  <aside
    class="settings-sidebar"
    aria-label="Settings categories"
  >
    <el-menu
      :default-active="activeTab"
      @select="selectTab"
    >
      <el-menu-item index="general">
        <SettingsIcon aria-hidden="true" />
        <span>General</span>
      </el-menu-item>
      <el-menu-item index="appearance">
        <PaletteIcon aria-hidden="true" />
        <span>Appearance</span>
      </el-menu-item>
      <el-menu-item index="integrations">
        <GitHubIcon aria-hidden="true" />
        <span>Integrations</span>
      </el-menu-item>
    </el-menu>
  </aside>
</template>

<script setup lang="ts">
import type { SettingsTab } from './settings-tabs';
import { GitHubIcon, PaletteIcon, SettingsIcon } from '../shared/icons/app-icons';

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
.settings-sidebar {
  border-right: 1px solid var(--color-border);
  background: var(--color-shell-sidebar);
  padding-top: var(--space-16);
}

.settings-sidebar :deep(.el-menu) {
  border-right: 0;
  background: transparent;
  padding: var(--space-8);
}

.settings-sidebar :deep(.el-menu-item) {
  height: 48px;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--font-size-15);
}

.settings-sidebar :deep(.el-menu-item svg) {
  width: var(--icon-md);
  height: var(--icon-md);
  flex: 0 0 auto;
  stroke-width: 2px;
}

.settings-sidebar :deep(.el-menu-item:hover) {
  background: var(--color-surface-base);
}

.settings-sidebar :deep(.el-menu-item.is-active) {
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}
</style>
