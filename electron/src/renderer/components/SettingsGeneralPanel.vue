<template>
  <SettingsPanelFrame
    title="General"
    title-id="settings-general-title"
  >
    <SettingsSection
      title="Behavior"
      title-id="settings-general-behavior-title"
    >
      <SettingsRow
        as="label"
        title="Prevent sleep while agents run"
        description="Keep this computer awake while an agent is active"
      >
        <template #control>
          <el-switch
            :model-value="settings.preventSleepWhenAgentsRun"
            aria-label="Prevent sleep while agents run"
            @update:model-value="updatePreventSleep"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        as="label"
        title="Keep Codex Claw ready in the background"
        :description="daemonDescription"
        :error="daemonStatusError"
      >
        <template #control>
          <span class="settings-general-panel__actions">
            <span
              class="settings-general-panel__status"
              :class="{
                'settings-general-panel__status--loading': daemonOperation !== null,
              }"
            >
              <span
                v-if="daemonOperation !== null"
                class="settings-general-panel__spinner"
                aria-hidden="true"
              />
              <Circle
                v-else
                class="settings-general-panel__status-icon"
                :class="{ 'settings-general-panel__status-icon--ok': daemonEnabled }"
                aria-hidden="true"
              />
              {{ daemonStatusLabel }}
            </span>
            <el-switch
              :model-value="daemonEnabled"
              :disabled="daemonSwitchDisabled"
              aria-label="Keep Codex Claw ready in the background"
              @update:model-value="updateDaemonEnabled"
            />
          </span>
        </template>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      v-if="showSourceFolderSetting"
      title="Source folder"
      title-id="settings-general-source-title"
    >
      <SettingsRow
        title="Source folder"
        description="Discover repositories and worktrees when creating agents"
        :error="sourceFolderError"
      >
        <template #control>
          <span class="settings-general-panel__actions settings-general-panel__actions--source">
            <span
              class="settings-general-panel__path"
              :title="sourceFolderLabel"
            >
              {{ sourceFolderLabel }}
            </span>
            <el-button
              size="small"
              :loading="choosingSourceFolder"
              @click="chooseSourceFolder"
            >
              Choose
            </el-button>
            <el-button
              v-if="sourceFolderState.path"
              size="small"
              @click="clearSourceFolder"
            >
              Clear
            </el-button>
          </span>
        </template>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      title="System permissions"
      title-id="settings-general-permissions-title"
    >
      <SettingsRow
        title="Accessibility"
        :description="accessibilityDescription"
      >
        <template #control>
          <span class="settings-general-panel__actions">
            <span
              class="settings-general-panel__status"
              :class="{ 'settings-general-panel__status--granted': accessibilityGranted }"
            >
              <ShieldCheckIcon aria-hidden="true" />
              {{ accessibilityStatusLabel }}
            </span>
            <el-button
              v-if="showGrantButton"
              :loading="openingAccessibilitySettings"
              size="small"
              @click="grantAccessibility"
            >
              Grant
            </el-button>
            <el-button
              v-else-if="permissions?.accessibility.required"
              :loading="loadingPermissions"
              size="small"
              @click="loadPermissions"
            >
              Refresh
            </el-button>
          </span>
        </template>
      </SettingsRow>
    </SettingsSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import type { AppGeneralSettings, ClawdDaemonStatus, SourceFolderState, SystemPermissionsStatus, UpdateSettingsInput } from '@codex-claw/shared/contracts';
import { defaultSourceFolderState } from '@codex-claw/shared/settings';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';
import { Circle, ShieldCheckIcon } from '../shared/icons/app-icons';

const defaultPermissionsStatus: SystemPermissionsStatus = {
  platform: 'unknown',
  accessibility: {
    required: false,
    trusted: true,
  },
};

const props = defineProps<{
  chooseSourceFolder?: () => Promise<string | null>;
  daemonStatus?: ClawdDaemonStatus | null;
  daemonStatusError?: string | null;
  getSystemPermissions?: () => Promise<SystemPermissionsStatus>;
  openAccessibilitySettings?: () => Promise<SystemPermissionsStatus>;
  restartApp?: () => Promise<void>;
  setDaemonEnabled?: (enabled: boolean) => Promise<void>;
  settings: AppGeneralSettings;
  sourceFolder?: SourceFolderState;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();

const permissions = ref<SystemPermissionsStatus | null>(null);
const loadingPermissions = ref(false);
const openingAccessibilitySettings = ref(false);
const choosingSourceFolder = ref(false);
const settingDaemon = ref(false);
const daemonOperation = ref<'installing' | 'uninstalling' | null>(null);
const sourceFolderError = ref<string | null>(null);

const showSourceFolderSetting = computed(() => Boolean(props.sourceFolder));
const sourceFolderState = computed(() => props.sourceFolder ?? defaultSourceFolderState);
const sourceFolderLabel = computed(() => sourceFolderState.value.path || 'Not configured');
const daemonEnabled = computed(() => props.daemonStatus?.installed ?? false);
const daemonRunning = computed(() => props.daemonStatus?.running ?? false);
const daemonSwitchDisabled = computed(() => settingDaemon.value || props.daemonStatus?.supported !== true);
const daemonStatusLabel = computed(() => {
  if (daemonOperation.value === 'installing') {
    return 'Installing...';
  }
  if (daemonOperation.value === 'uninstalling') {
    return 'Uninstalling...';
  }
  if (!props.daemonStatus) {
    return 'Checking';
  }
  if (!props.daemonStatus.supported) {
    return 'Unavailable';
  }
  if (props.daemonStatus.running) {
    return 'Running';
  }
  return props.daemonStatus.installed ? 'Installed' : 'Off';
});
const daemonDescription = computed(() => {
  if (props.daemonStatus?.supported === false) {
    return props.daemonStatus.detail ?? 'Install is available in packaged macOS builds.';
  }
  return 'Start the Codex Claw agent to keep your loops running.';
});
const accessibilityGranted = computed(() => permissions.value?.accessibility.trusted ?? false);
const showGrantButton = computed(() => permissions.value?.accessibility.required === true && !accessibilityGranted.value);
const accessibilityStatusLabel = computed(() => {
  if (!permissions.value) {
    return 'Checking';
  }

  if (!permissions.value.accessibility.required) {
    return 'Not needed';
  }

  return accessibilityGranted.value ? 'Granted' : 'Required';
});
const accessibilityDescription = computed(() => {
  if (permissions.value?.accessibility.required === false) {
    return 'Computer Use does not need this permission on this platform.';
  }

  return 'Required for Computer Use to inspect and click Codex Claw.';
});

onMounted(() => {
  void loadPermissions();
});

async function loadPermissions(): Promise<void> {
  loadingPermissions.value = true;
  try {
    permissions.value = await (props.getSystemPermissions ?? getSystemPermissions)();
  } finally {
    loadingPermissions.value = false;
  }
}

async function grantAccessibility(): Promise<void> {
  openingAccessibilitySettings.value = true;
  try {
    permissions.value = await (props.openAccessibilitySettings ?? openAccessibilitySettings)();
  } finally {
    openingAccessibilitySettings.value = false;
  }
}

async function chooseSourceFolder(): Promise<void> {
  sourceFolderError.value = null;
  choosingSourceFolder.value = true;
  try {
    const selected = await props.chooseSourceFolder?.();
    if (selected) {
      await props.updateSettings?.({
        sourceFolder: {
          path: selected,
        },
      });
    }
  } catch (error) {
    sourceFolderError.value = error instanceof Error ? error.message : String(error);
  } finally {
    choosingSourceFolder.value = false;
  }
}

function clearSourceFolder(): void {
  sourceFolderError.value = null;
  void props.updateSettings?.({
    sourceFolder: {
      path: '',
    },
  });
}

async function getSystemPermissions(): Promise<SystemPermissionsStatus> {
  return window.codexClaw?.getSystemPermissions?.() ?? defaultPermissionsStatus;
}

async function openAccessibilitySettings(): Promise<SystemPermissionsStatus> {
  return window.codexClaw?.openAccessibilitySettings?.() ?? defaultPermissionsStatus;
}

function updatePreventSleep(value: boolean | string | number): void {
  void props.updateSettings?.({
    general: {
      preventSleepWhenAgentsRun: value === true,
    },
  });
}

async function updateDaemonEnabled(value: boolean | string | number): Promise<void> {
  const enabled = value === true;
  daemonOperation.value = enabled ? 'installing' : 'uninstalling';
  settingDaemon.value = true;
  try {
    await props.setDaemonEnabled?.(enabled);
    await promptForRestartAfterDaemonChange(enabled);
  } finally {
    settingDaemon.value = false;
    daemonOperation.value = null;
  }
}

async function promptForRestartAfterDaemonChange(enabled: boolean): Promise<void> {
  try {
    await ElMessageBox.confirm(
      enabled
        ? 'Codex Claw needs to restart to connect to the background agent.'
        : 'Codex Claw needs to restart to use the in-app agent.',
      'Restart Codex Claw?',
      {
        cancelButtonText: 'Later',
        confirmButtonText: 'Restart now',
        distinguishCancelAndClose: true,
        type: 'info',
      },
    );
  } catch {
    return;
  }

  await props.restartApp?.();
}
</script>

<style scoped>
.settings-general-panel__actions {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-self: end;
  justify-content: flex-end;
  gap: var(--space-8);
}

.settings-general-panel__actions--source {
  width: min(360px, 100%);
}

.settings-general-panel__path {
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-6);
  color: var(--color-text);
  background: var(--color-surface-low);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-general-panel__status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.settings-general-panel__status svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  stroke-width: 2;
}

.settings-general-panel__status--granted {
  color: var(--color-success);
}

.settings-general-panel__status--loading {
  color: var(--color-text-muted);
  font-weight: var(--font-weight-regular);
}

.settings-general-panel__status-icon--ok {
  color: var(--color-success);
  fill: currentColor;
}

.settings-general-panel__spinner {
  width: var(--icon-sm);
  height: var(--icon-sm);
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 999px;
  animation: settings-general-panel-spin 0.8s linear infinite;
}

@keyframes settings-general-panel-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 780px) {
  .settings-general-panel__actions--source {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
</style>
