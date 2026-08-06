<template>
  <SettingsPanelFrame
    title="Appshots"
    title-id="settings-appshots-title"
  >
    <div class="settings-appshots-panel__intro">
      <span class="settings-appshots-panel__icon" aria-hidden="true">
        <PhotoIcon />
      </span>
      <span>
        <strong>Take an Appshot to show Codex your frontmost window</strong>
        <span>Appshots capture the window image and attach it to your active agent.</span>
      </span>
    </div>

    <SettingsSection>
      <SettingsRow
        title="Hotkey"
        :description="hotkeyDescription"
      >
        <template #control>
          <el-select
            :model-value="settings.hotkey"
            aria-label="Appshot hotkey"
            class="settings-appshots-panel__select"
            @update:model-value="updateHotkey"
          >
            <el-option label="⌘ + ⌘" value="command" />
            <el-option label="⌥ + ⌥" value="option" />
            <el-option label="⇧ + ⇧" value="shift" />
            <el-option label="None" value="none" />
          </el-select>
        </template>
      </SettingsRow>
      <SettingsRow
        title="Appshot destination"
        description="Choose where Appshots go when you use the hotkey"
      >
        <template #control>
          <el-select
            model-value="active-agent"
            aria-label="Appshot destination"
            class="settings-appshots-panel__select"
          >
            <el-option label="Active agent" value="active-agent" />
          </el-select>
        </template>
      </SettingsRow>
      <SettingsRow
        as="label"
        title="Play sound effect"
        description="Confirm when the frontmost window has been captured"
      >
        <template #control>
          <el-switch
            :model-value="settings.playSound"
            aria-label="Play Appshot sound effect"
            @update:model-value="updatePlaySound"
          />
        </template>
      </SettingsRow>
    </SettingsSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AppshotHotkey, AppshotSettings, UpdateSettingsInput } from '@codex-claw/shared/contracts';
import { PhotoIcon } from '../shared/icons/app-icons';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

const props = defineProps<{
  settings: AppshotSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();

const hotkeyDescription = computed(() => {
  if (props.settings.hotkey === 'none') return 'Appshots are disabled';
  const label = props.settings.hotkey === 'command' ? 'Command' : props.settings.hotkey === 'option' ? 'Option' : 'Shift';
  return `Press both ${label} keys simultaneously`;
});

function updateHotkey(hotkey: AppshotHotkey): void {
  void props.updateSettings?.({ general: { appshots: { ...props.settings, hotkey } } });
}

function updatePlaySound(playSound: boolean): void {
  void props.updateSettings?.({ general: { appshots: { ...props.settings, playSound } } });
}
</script>

<style scoped>
.settings-appshots-panel__intro {
  display: flex;
  align-items: center;
  gap: var(--space-12);
  margin-bottom: var(--space-16);
  padding: var(--space-12);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
}

.settings-appshots-panel__intro > span:last-child {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.settings-appshots-panel__intro strong {
  color: var(--color-text);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-22);
}

.settings-appshots-panel__intro > span:last-child > span {
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
}

.settings-appshots-panel__icon {
  width: var(--space-32);
  height: var(--space-32);
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  color: var(--color-on-primary-container);
  background: var(--color-primary-container);
}

.settings-appshots-panel__icon svg {
  width: var(--icon-lg);
  height: var(--icon-lg);
}

.settings-appshots-panel__select {
  width: 170px;
}
</style>
