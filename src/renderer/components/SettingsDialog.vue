<template>
  <el-dialog
    v-model="dialogVisible"
    align-center
    class="claw-dialog settings-dialog"
    width="680px"
  >
    <template #header>
      <div class="claw-dialog__header">
        <div>
          <h2>Settings</h2>
        </div>
      </div>
    </template>

    <div class="settings-dialog__layout">
      <SettingsDialogSidebar
        :active-tab="activeTab"
        @select="activeTab = $event"
      />
      <SettingsGeneralPanel
        v-if="activeTab === 'general'"
      />
      <SettingsAppearancePanel
        v-else
        :settings="settings"
        :update-settings="updateSettings"
      />
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AppThemeSettings, UpdateSettingsInput } from '../../shared/contracts';
import SettingsAppearancePanel from './SettingsAppearancePanel.vue';
import SettingsDialogSidebar from './SettingsDialogSidebar.vue';
import SettingsGeneralPanel from './SettingsGeneralPanel.vue';
import type { SettingsTab } from './settings-dialog-tabs';

const props = defineProps<{
  settings: AppThemeSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
}>();

const activeTab = ref<SettingsTab>('appearance');

const dialogVisible = computed({
  get: () => props.visible,
  set: (visible) => emit('update:visible', visible),
});
</script>

<style>

.settings-dialog {
  .el-dialog__header {
    padding: var(--space-4) var(--space-16);
  }
}

</style>

<style scoped>

.settings-dialog__layout {
  display: grid;
  min-height: 360px;
  grid-template-columns: 168px minmax(0, 1fr);
  overflow: hidden;
}
</style>
