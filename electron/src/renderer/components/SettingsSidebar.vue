<template>
  <aside
    class="settings-sidebar"
    aria-label="Settings categories"
  >
    <el-menu
      :default-active="activeTab"
      @select="selectTab"
    >
      <el-menu-item index="chatgpt">
        <BrandOpenaiIcon aria-hidden="true" />
        <span>ChatGPT</span>
      </el-menu-item>
      <el-menu-item index="general">
        <SettingsIcon aria-hidden="true" />
        <span>General</span>
      </el-menu-item>
      <el-menu-item index="appearance">
        <PaletteIcon aria-hidden="true" />
        <span>Appearance</span>
      </el-menu-item>
      <el-menu-item index="integrations">
        <AffiliateIcon aria-hidden="true" />
        <span>Integrations</span>
      </el-menu-item>
      <el-menu-item index="connections">
        <TerminalIcon aria-hidden="true" />
        <span>Connections</span>
      </el-menu-item>
    </el-menu>
  </aside>
</template>

<script setup lang="ts">
import type { SettingsTab } from './settings-tabs';
import { AffiliateIcon, BrandOpenaiIcon, PaletteIcon, SettingsIcon, TerminalIcon } from '../shared/icons/app-icons';

defineProps<{
  activeTab: SettingsTab;
}>();

const emit = defineEmits<{
  select: [tab: SettingsTab];
}>();

function selectTab(tab: string): void {
  if (tab === 'chatgpt' || tab === 'general' || tab === 'appearance' || tab === 'integrations' || tab === 'connections') {
    emit('select', tab);
  }
}
</script>

<style scoped>
.settings-sidebar {
  border-right: 1px solid var(--color-border);
  background: var(--color-shell-sidebar);
  padding-top: var(--space-24);
}

.settings-sidebar :deep(.el-menu) {
  border-right: 0;
  background: transparent;
  padding: var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.settings-sidebar :deep(.el-menu-item) {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-4) !important;
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  font-size: var(--font-size-15);
}

.settings-sidebar :deep(.el-menu-item svg) {
  flex: 0 0 auto;
  width: var(--icon-md);
  height: var(--icon-md);
  stroke-width: 1.5px;
}

.settings-sidebar :deep(.el-menu-item:hover) {
  background: var(--color-surface-high);
}

.settings-sidebar :deep(.el-menu-item.is-active) {
  color: var(--color-text);
  background: var(--color-surface-high);
}
</style>
