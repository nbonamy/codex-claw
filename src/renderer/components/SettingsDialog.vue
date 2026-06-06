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
      <aside class="settings-dialog__sidebar" aria-label="Settings categories">
        <el-menu :default-active="activeTab" @select="selectTab">
          <el-menu-item index="general">General</el-menu-item>
          <el-menu-item index="appearance">Appearance</el-menu-item>
        </el-menu>
      </aside>

      <section
        v-if="activeTab === 'general'"
        class="settings-dialog__panel"
        aria-labelledby="settings-general-title"
      >
        <h3 id="settings-general-title">General</h3>
        <p class="settings-dialog__empty">No general settings yet.</p>
      </section>

      <section
        v-else
        class="settings-dialog__panel"
        aria-labelledby="settings-appearance-title"
      >
        <h3 id="settings-appearance-title">Appearance</h3>
        <div class="settings-dialog__rows">
          <label class="settings-dialog__row">
            <span>Mode</span>
            <el-segmented
              :model-value="settings.mode"
              :options="modeOptions"
              @update:model-value="updateMode"
            />
          </label>
          <label class="settings-dialog__row">
            <span>Theme</span>
            <el-select
              :model-value="settings.id"
              aria-label="Theme"
              @update:model-value="updateThemeId"
            >
              <el-option
                v-for="theme in visibleThemes"
                :key="theme.id"
                :label="theme.name"
                :value="theme.id"
              />
            </el-select>
          </label>
          <label class="settings-dialog__row">
            <span>UI font size</span>
            <el-input-number
              :model-value="settings.uiFontSize"
              :min="11"
              :max="22"
              @update:model-value="updateNumericTheme('uiFontSize', $event)"
            />
          </label>
          <label class="settings-dialog__row">
            <span>Chat font size</span>
            <el-input-number
              :model-value="settings.chatFontSize"
              :min="11"
              :max="22"
              @update:model-value="updateNumericTheme('chatFontSize', $event)"
            />
          </label>
          <label class="settings-dialog__row">
            <span>Code font size</span>
            <el-input-number
              :model-value="settings.codeFontSize"
              :min="11"
              :max="22"
              @update:model-value="updateNumericTheme('codeFontSize', $event)"
            />
          </label>
        </div>
      </section>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AppThemeSettings, UpdateSettingsInput } from '../../shared/contracts';
import { appThemes, themeIdForAppearance } from '../theme/themes';

const props = defineProps<{
  settings: AppThemeSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [visible: boolean];
}>();

type SettingsTab = 'appearance' | 'general';

const activeTab = ref<SettingsTab>('appearance');
const themes = appThemes;
const visibleThemes = computed(() => {
  if (props.settings.mode === 'system') {
    return themes;
  }

  return themes.filter((theme) => theme.appearance === props.settings.mode);
});
const modeOptions = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
];

const dialogVisible = computed({
  get: () => props.visible,
  set: (visible) => emit('update:visible', visible),
});

function selectTab(tab: string): void {
  if (tab === 'general' || tab === 'appearance') {
    activeTab.value = tab;
  }
}

function updateTheme(theme: Partial<AppThemeSettings>): void {
  void props.updateSettings?.({ theme });
}

function updateMode(mode: string | number): void {
  if (mode !== 'dark' && mode !== 'light' && mode !== 'system') {
    return;
  }

  if (mode === 'system') {
    updateTheme({ mode });
    return;
  }

  const currentTheme = themes.find((theme) => theme.id === props.settings.id);
  const nextThemeId = currentTheme?.appearance === mode
    ? currentTheme.id
    : themeIdForAppearance(props.settings.id, mode);

  updateTheme({
    mode,
    ...(nextThemeId ? { id: nextThemeId } : {}),
  });
}

function updateThemeId(id: string): void {
  updateTheme({ id });
}

function updateNumericTheme(key: 'chatFontSize' | 'codeFontSize' | 'uiFontSize', value: number | null): void {
  if (typeof value !== 'number') {
    return;
  }

  updateTheme({ [key]: value });
}
</script>

<style scoped>

.settings-dialog {
  &:deep() {
    .el-dialog__header {
      padding: 0;
    }
  }
}

.settings-dialog__layout {
  display: grid;
  min-height: 360px;
  grid-template-columns: 168px minmax(0, 1fr);
  overflow: hidden;
}

.settings-dialog__sidebar {
  border-right: 1px solid var(--color-border);
  background: var(--color-surface-base);
}

.settings-dialog__sidebar :deep(.el-menu) {
  border-right: 0;
  background: transparent;
  padding: var(--space-4);
}

.settings-dialog__sidebar :deep(.el-menu-item) {
  height: 34px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
}

.settings-dialog__sidebar :deep(.el-menu-item:hover) {
  background: transparent;
}

.settings-dialog__sidebar :deep(.el-menu-item.is-active) {
  color: var(--color-text);
  font-weight: var(--font-weight-medium);
}

.settings-dialog__panel {
  min-width: 0;
  padding: var(--space-8);
  background: var(--color-surface-lowest);
}

.settings-dialog__panel h3 {
  margin: 0 0 var(--space-8);
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.settings-dialog__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}

.settings-dialog__rows {
  display: grid;
}

.settings-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8);
  min-height: 58px;
  border-bottom: 1px solid var(--color-border);
}

.settings-dialog__row:last-child {
  border-bottom: 0;
}

.settings-dialog__row > span {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
}

.settings-dialog__row :deep(.el-select) {
  width: 220px;
}
</style>
