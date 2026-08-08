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
        v-if="clawHostCapabilities.computerUse"
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
        :error="settingsError"
      >
        <template #control>
          <el-button
            circle
            :loading="managingPlugins"
            aria-label="Manage other plugins in ChatGPT"
            @click="managePlugins"
          >
            <ChevronRightIcon aria-hidden="true" />
          </el-button>
        </template>
      </SettingsRow>
    </SettingsSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { AppPluginSettings, AppPluginStatus, UpdateSettingsInput } from '@codex-claw/core/contracts';
import { defaultPluginSettings } from '@codex-claw/core/settings';
import { ChevronRightIcon } from '../shared/icons/app-icons';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsPluginsBanner from './SettingsPluginsBanner.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';
import { clawHostCapabilities, clawPlatformActions } from '../platform-api';

type PendingPlugin = 'computerUse' | 'chrome';

const props = withDefaults(defineProps<{
  settings?: AppPluginSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
  getPluginStatus?: () => Promise<AppPluginStatus>;
}>(), {
  settings: () => ({ ...defaultPluginSettings }),
  updateSettings: async () => undefined,
  getPluginStatus: undefined,
});

const managingPlugins = ref(false);
const settingsError = ref<string | null>(null);
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

function updatePlugin(plugin: PendingPlugin, enabled: boolean): void {
  if (plugin === 'chrome') {
    settingsError.value = null;
    void managePlugins();
    return;
  }
  if (enabled) {
    settingsError.value = null;
    void persistPlugin(plugin, true);
    return;
  }

  void persistPlugin(plugin, false);
}

async function persistPlugin(plugin: PendingPlugin, enabled: boolean): Promise<void> {
  const key = plugin === 'computerUse' ? 'computerUseEnabled' : 'chromeEnabled';
  settingsError.value = null;
  try {
    await props.updateSettings({ general: { plugins: { [key]: enabled } } });
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : String(error);
  }
}

async function managePlugins(): Promise<void> {
  managingPlugins.value = true;
  settingsError.value = null;
  try {
    await clawPlatformActions.managePlugins();
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : String(error);
  } finally {
    managingPlugins.value = false;
  }
}
</script>

<style scoped>
.settings-plugins-panel :deep(.el-button.is-circle svg) {
  width: var(--icon-sm);
  height: var(--icon-sm);
}
</style>
