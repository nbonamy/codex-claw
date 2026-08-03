<template>
  <SettingsPanelFrame
    title="Plugins"
    title-id="settings-plugins-title"
  >
    <template #banner>
      <SettingsPluginsBanner />
    </template>

    <SettingsSection>
      <SettingsRow
        as="label"
        title="Computer Use"
        :error="settingsError"
        description="Let agents inspect and control macOS apps through the local Computer Use helper"
      >
        <template #control>
          <el-switch
            :model-value="pluginSettings.computerUseEnabled"
            aria-label="Enable Computer Use"
            @update:model-value="updatePlugin('computerUse', $event)"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        as="label"
        title="Chrome"
        :error="settingsError"
        description="Let agents work with your existing Chrome tabs, sessions, and extensions"
      >
        <template #control>
          <el-switch
            :model-value="chromeEnabled"
            aria-label="Enable Chrome"
            @update:model-value="updatePlugin('chrome', $event)"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        title="Other plugins"
        description="GitHub, Slack, Jira, Linear, Gmail, Google Drive, and more"
      >
        <template #control>
          <el-button
            circle
            aria-label="Manage other plugins in ChatGPT"
            @click="openChatGptDialog(null)"
          >
            <ChevronRightIcon aria-hidden="true" />
          </el-button>
        </template>
      </SettingsRow>
    </SettingsSection>

    <el-dialog
      v-model="dialogVisible"
      class="claw-dialog settings-plugins-dialog"
      :teleported="false"
      width="560px"
      :close-on-click-modal="false"
      :close-on-press-escape="!launching"
      :show-close="false"
      destroy-on-close
    >
      <template #header>
        <div class="claw-dialog__header settings-plugins-dialog__header">
          <h2 class="claw-dialog__title">Manage plugins in ChatGPT</h2>
          <button
            class="claw-dialog__icon-button"
            type="button"
            aria-label="Close"
            :disabled="launching"
            @click="dialogVisible = false"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </template>
      <div class="claw-form-dialog settings-plugins-dialog__form">
        <p class="settings-plugins-dialog__copy">
          ChatGPT manages plugin installation and permissions. Launch ChatGPT
          to install or configure plugins; anything enabled there becomes
          available to Codex Claw through the same Codex home.
        </p>
        <p
          v-if="dialogError"
          class="settings-plugins-dialog__error"
          role="alert"
        >
          {{ dialogError }}
        </p>
      </div>
      <template #footer>
        <div class="claw-dialog__footer">
          <el-button
            :disabled="launching"
            @click="dialogVisible = false"
          >
            Not now
          </el-button>
          <el-button
            type="primary"
            :loading="launching"
            @click="launchChatGpt"
          >
            Launch ChatGPT
          </el-button>
        </div>
      </template>
    </el-dialog>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AppPluginSettings, AppPluginStatus, UpdateSettingsInput } from '@codex-claw/shared/contracts';
import { defaultPluginSettings } from '@codex-claw/shared/settings';
import { ChevronRightIcon, X } from '../shared/icons/app-icons';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsPluginsBanner from './SettingsPluginsBanner.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

type PendingPlugin = 'computerUse' | 'chrome' | null;

const props = withDefaults(defineProps<{
  settings?: AppPluginSettings;
  launchChatGptApp?: () => Promise<void>;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
  getPluginStatus?: () => Promise<AppPluginStatus>;
}>(), {
  settings: () => ({ ...defaultPluginSettings }),
  updateSettings: async () => undefined,
  getPluginStatus: undefined,
});

const dialogVisible = ref(false);
const launching = ref(false);
const dialogError = ref<string | null>(null);
const settingsError = ref<string | null>(null);
const pendingPlugin = ref<PendingPlugin>(null);
const chromeEnabled = ref(false);
const pluginSettings = computed(() => props.settings ?? defaultPluginSettings);
let pluginStatusTimer: number | undefined;

async function refreshPluginStatus(): Promise<void> {
  if (!props.getPluginStatus) {
    chromeEnabled.value = props.settings?.chromeEnabled === true;
    return;
  }
  try {
    chromeEnabled.value = (await props.getPluginStatus()).chromeEnabled === true;
  } catch {
    // Preserve the last known status through transient config/IPC failures.
  }
}

watch(() => props.settings?.chromeEnabled, (value) => {
  if (!props.getPluginStatus) chromeEnabled.value = value === true;
});

onMounted(() => {
  void refreshPluginStatus();
  pluginStatusTimer = window.setInterval(() => { void refreshPluginStatus(); }, 5_000);
});

onBeforeUnmount(() => {
  if (pluginStatusTimer !== undefined) window.clearInterval(pluginStatusTimer);
});

function openChatGptDialog(plugin: PendingPlugin): void {
  pendingPlugin.value = plugin;
  dialogError.value = null;
  dialogVisible.value = true;
}

function updatePlugin(plugin: Exclude<PendingPlugin, null>, enabled: boolean): void {
  if (plugin === 'chrome') {
    settingsError.value = null;
    openChatGptDialog('chrome');
    return;
  }
  if (enabled) {
    settingsError.value = null;
    void persistPlugin(plugin, true);
    return;
  }

  void persistPlugin(plugin, false);
}

async function persistPlugin(plugin: Exclude<PendingPlugin, null>, enabled: boolean): Promise<void> {
  const key = plugin === 'computerUse' ? 'computerUseEnabled' : 'chromeEnabled';
  settingsError.value = null;
  try {
    await props.updateSettings({ general: { plugins: { [key]: enabled } } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialogError.value = message;
    settingsError.value = message;
  }
}

async function launchChatGpt(): Promise<void> {
  launching.value = true;
  dialogError.value = null;
  try {
    const launchApp = props.launchChatGptApp ?? window.codexClaw?.launchChatGptApp;
    if (!launchApp) {
      throw new Error('ChatGPT could not be launched from this window.');
    }
    await launchApp();
    dialogVisible.value = false;
  } catch (error) {
    dialogError.value = error instanceof Error ? error.message : String(error);
  } finally {
    launching.value = false;
  }
}
</script>

<style scoped>
.settings-plugins-dialog :deep(.el-dialog__body) {
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  line-height: var(--line-height-22);
}

.settings-plugins-dialog__header {
  margin-left: calc(-1 * var(--space-4));
}

.settings-plugins-dialog__form {
  padding: var(--space-12) var(--space-4) 0;
}

.settings-plugins-dialog__copy,
.settings-plugins-dialog__error {
  margin: 0;
}

.settings-plugins-dialog__error {
  color: var(--color-danger, #c2410c);
}

.settings-plugins-panel :deep(.el-button.is-circle svg) {
  width: var(--icon-sm);
  height: var(--icon-sm);
}
</style>
