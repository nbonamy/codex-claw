<template>
  <aside
    class="settings-sidebar"
    :aria-label="$t('surface.settingsSidebar.settingsCategories')"
  >
    <el-menu
      :default-active="activeTab"
      @select="selectTab"
    >
      <el-menu-item index="general">
        <SettingsIcon aria-hidden="true" />
        <span>{{ $t('surface.settingsSidebar.general') }}</span>
      </el-menu-item>
      <el-menu-item index="appearance">
        <PaletteIcon aria-hidden="true" />
        <span>{{ $t('surface.settingsSidebar.appearance') }}</span>
      </el-menu-item>
      <el-menu-item index="personalization">
        <SettingsIcon aria-hidden="true" />
        <span>{{ $t('surface.instructionSettings.personalization') }}</span>
      </el-menu-item>
      <el-menu-item index="codex">
        <BackendIcon backend="codex" monochrome />
        <span>{{ $t('surface.settingsSidebar.codex') }}</span>
      </el-menu-item>
      <el-menu-item index="claude-code">
        <BackendIcon backend="claude" monochrome />
        <span>{{ $t('surface.settingsSidebar.claudeCode') }}</span>
      </el-menu-item>
      <el-menu-item index="plugins">
        <PuzzleIcon aria-hidden="true" />
        <span>{{ $t('surface.settingsSidebar.plugins') }}</span>
      </el-menu-item>
      <el-menu-item index="integrations">
        <AffiliateIcon aria-hidden="true" />
        <span>{{ $t('surface.settingsSidebar.integrations') }}</span>
      </el-menu-item>
      <el-menu-item v-if="appHostCapabilities.appshots" index="appshots">
        <PhotoIcon aria-hidden="true" />
        <span>{{ $t('surface.settingsSidebar.appshots') }}</span>
      </el-menu-item>
      <el-menu-item index="connections">
        <TerminalIcon aria-hidden="true" />
        <span>{{ $t('surface.settingsSidebar.connections') }}</span>
      </el-menu-item>
      <el-menu-item index="git">
        <GitBranchIcon aria-hidden="true" />
        <span>{{ $t('surface.instructionSettings.git') }}</span>
      </el-menu-item>
    </el-menu>
  </aside>
</template>

<script setup lang="ts">
import type { SettingsTab } from './settings-tabs';
import { AffiliateIcon, GitBranchIcon, PaletteIcon, PhotoIcon, PuzzleIcon, SettingsIcon, TerminalIcon } from '../shared/icons/app-icons';
import BackendIcon from './BackendIcon.vue';
import { appHostCapabilities } from '../platform-api';

defineProps<{
  activeTab: SettingsTab;
}>();

const emit = defineEmits<{
  select: [tab: SettingsTab];
}>();

function selectTab(tab: string): void {
  if (tab === 'personalization' || tab === 'git' || tab === 'general' || tab === 'codex' || tab === 'claude-code' || tab === 'appearance' || tab === 'appshots' || tab === 'plugins' || tab === 'integrations' || tab === 'connections') {
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

.settings-sidebar :deep(.el-menu-item svg),
.settings-sidebar :deep(.el-menu-item .backend-icon) {
  flex: 0 0 auto;
  width: var(--icon-md);
  height: var(--icon-md);
  stroke-width: 1.5px;
}

.settings-sidebar :deep(.el-menu-item:hover) {
  background: var(--color-surface-high);
}

.settings-sidebar :deep(.el-menu-item .backend-icon) {
  transform: scale(1.15);
}

.settings-sidebar :deep(.el-menu-item.is-active) {
  color: var(--color-text);
  background: var(--color-surface-high);
}
</style>
