<template>
  <SettingsPanelFrame
    title="General"
    title-id="settings-general-title"
  >
    <SettingsSection
      v-if="clawHostCapabilities.daemonManagement"
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
      v-if="clawHostCapabilities.nativeFileDialogs && showSourceFolderSetting"
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
      v-if="clawHostCapabilities.systemPermissions"
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
              v-if="showAccessibilityGrantButton"
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
      <SettingsRow
        title="Screen Recording"
        :description="screenRecordingDescription"
      >
        <template #control>
          <span class="settings-general-panel__actions">
            <span
              class="settings-general-panel__status"
              :class="{ 'settings-general-panel__status--granted': screenRecordingGranted }"
            >
              <ShieldCheckIcon aria-hidden="true" />
              {{ screenRecordingStatusLabel }}
            </span>
            <el-button
              v-if="showScreenRecordingGrantButton"
              :loading="openingScreenRecordingSettings"
              size="small"
              @click="grantScreenRecording"
            >
              Grant
            </el-button>
            <el-button
              v-else-if="permissions?.screenRecording.required"
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

    <SettingsSection
      title="Advanced"
      title-id="settings-general-advanced-title"
    >
      <SettingsRow
        as="label"
        title="Share skills and plugins with ChatGPT"
        :description="codexResourceSharingDescription"
        :error="codexResourceSharingError"
      >
        <template #control>
          <el-switch
            :model-value="settings.shareCodexSkillsAndPlugins"
            :loading="changingCodexResourceSharing"
            aria-label="Share skills and plugins with ChatGPT"
            @update:model-value="updateCodexResourceSharing"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        v-if="clawHostCapabilities.nativeFileDialogs"
        title="Codex executable"
        description="Leave empty to use the bundled Codex. Changing this restarts Codex Claw."
        :error="codexBinaryError"
      >
        <template #control>
          <span class="settings-general-panel__codex-binary">
            <el-input
              v-model="codexBinaryDraft"
              aria-label="Codex executable path"
              clearable
              placeholder="Bundled Codex"
              size="small"
              @change="updateCodexBinaryPath"
              @clear="clearCodexBinaryPath"
            />
            <el-button
              size="small"
              :loading="choosingCodexBinary"
              @click="chooseCodexBinary"
            >
              Choose
            </el-button>
            <el-button
              v-if="settings.codexBinaryPath"
              size="small"
              @click="clearCodexBinaryPath"
            >
              Clear
            </el-button>
          </span>
        </template>
      </SettingsRow>
    </SettingsSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';
import { computed, onMounted, ref, watch } from 'vue';
import type { AppGeneralSettings, ClawdDaemonStatus, SetCodexResourceSharingInput, SourceFolderState, SystemPermissionsStatus, UpdateSettingsInput } from '@codex-claw/core/contracts';
import { defaultSourceFolderState } from '@codex-claw/core/settings';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';
import { Circle, ShieldCheckIcon } from '../shared/icons/app-icons';
import { clawHostCapabilities, codexClawApi } from '../platform-api';

const defaultPermissionsStatus: SystemPermissionsStatus = {
  platform: 'unknown',
  accessibility: {
    required: false,
    trusted: true,
  },
  screenRecording: {
    required: false,
    trusted: true,
  },
};

const props = defineProps<{
  chooseCodexBinary?: () => Promise<string | null>;
  chooseSourceFolder?: () => Promise<string | null>;
  daemonStatus?: ClawdDaemonStatus | null;
  daemonStatusError?: string | null;
  getSystemPermissions?: () => Promise<SystemPermissionsStatus>;
  openAccessibilitySettings?: () => Promise<SystemPermissionsStatus>;
  openScreenRecordingSettings?: () => Promise<SystemPermissionsStatus>;
  restartApp?: () => Promise<void>;
  setDaemonEnabled?: (enabled: boolean) => Promise<void>;
  setCodexResourceSharing?: (input: SetCodexResourceSharingInput) => Promise<void>;
  codexResourceSharingBlocked?: boolean;
  settings: AppGeneralSettings;
  sourceFolder?: SourceFolderState;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();

const permissions = ref<SystemPermissionsStatus | null>(null);
const loadingPermissions = ref(false);
const openingAccessibilitySettings = ref(false);
const openingScreenRecordingSettings = ref(false);
const choosingSourceFolder = ref(false);
const choosingCodexBinary = ref(false);
const changingCodexResourceSharing = ref(false);
const settingDaemon = ref(false);
const daemonOperation = ref<'installing' | 'uninstalling' | null>(null);
const sourceFolderError = ref<string | null>(null);
const codexBinaryError = ref<string | null>(null);
const codexResourceSharingError = ref<string | null>(null);
const codexBinaryDraft = ref(props.settings.codexBinaryPath);

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
const codexResourceSharingDescription = computed(() => props.codexResourceSharingBlocked
  ? 'This option cannot be changed while chats are running.'
  : 'Use the same skills and plugins as ChatGPT. Changing this restarts the backend.');
const accessibilityGranted = computed(() => permissions.value?.accessibility.trusted ?? false);
const showAccessibilityGrantButton = computed(() => permissions.value?.accessibility.required === true && !accessibilityGranted.value);
const screenRecordingGranted = computed(() => permissions.value?.screenRecording.trusted ?? false);
const showScreenRecordingGrantButton = computed(() => permissions.value?.screenRecording.required === true && !screenRecordingGranted.value);
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
const screenRecordingStatusLabel = computed(() => {
  if (!permissions.value) {
    return 'Checking';
  }

  if (!permissions.value.screenRecording.required) {
    return 'Not needed';
  }

  return screenRecordingGranted.value ? 'Granted' : 'Required';
});
const screenRecordingDescription = computed(() => {
  if (permissions.value?.screenRecording.required === false) {
    return 'Appshots do not need this permission on this platform.';
  }

  return 'Required for Appshots to capture the frontmost window.';
});

onMounted(() => {
  if (clawHostCapabilities.systemPermissions) void loadPermissions();
});

watch(() => props.settings.codexBinaryPath, (path) => {
  codexBinaryDraft.value = path;
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

async function grantScreenRecording(): Promise<void> {
  openingScreenRecordingSettings.value = true;
  try {
    permissions.value = await (props.openScreenRecordingSettings ?? openScreenRecordingSettings)();
  } finally {
    openingScreenRecordingSettings.value = false;
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

async function chooseCodexBinary(): Promise<void> {
  codexBinaryError.value = null;
  choosingCodexBinary.value = true;
  try {
    const selected = await props.chooseCodexBinary?.();
    if (selected) {
      codexBinaryDraft.value = selected;
      await updateCodexBinaryPath(selected);
    }
  } catch (error) {
    codexBinaryError.value = error instanceof Error ? error.message : String(error);
  } finally {
    choosingCodexBinary.value = false;
  }
}

function updateCodexBinaryPath(value: string | number): Promise<void> | void {
  codexBinaryError.value = null;
  return props.updateSettings?.({
    general: {
      codexBinaryPath: String(value),
    },
  });
}

function clearCodexBinaryPath(): void {
  codexBinaryError.value = null;
  codexBinaryDraft.value = '';
  void updateCodexBinaryPath('');
}

async function updateCodexResourceSharing(value: boolean | string | number): Promise<void> {
  codexResourceSharingError.value = null;
  if (props.codexResourceSharingBlocked) {
    await ElMessageBox.alert(
      'This option cannot be changed while chats are running. Wait for every chat to finish and try again.',
      'Chats are running',
      {
        confirmButtonText: 'OK',
        type: 'warning',
      },
    );
    return;
  }

  const enabled = value === true;
  const input = enabled
    ? await confirmSharingEnabled()
    : await chooseIsolatedResourceMode();
  if (!input) return;

  changingCodexResourceSharing.value = true;
  try {
    await props.setCodexResourceSharing?.(input);
  } catch (error) {
    codexResourceSharingError.value = error instanceof Error ? error.message : String(error);
  } finally {
    changingCodexResourceSharing.value = false;
  }
}

async function confirmSharingEnabled(): Promise<SetCodexResourceSharingInput | null> {
  try {
    await ElMessageBox.confirm(
      'You are going to lose all plugins and skills installed only in Codex Claw. Continue?',
      'Share skills and plugins with ChatGPT?',
      {
        cancelButtonText: 'Cancel',
        confirmButtonText: 'Continue',
        distinguishCancelAndClose: true,
        type: 'warning',
      },
    );
    return { enabled: true };
  } catch {
    return null;
  }
}

async function chooseIsolatedResourceMode(): Promise<SetCodexResourceSharingInput | null> {
  try {
    await ElMessageBox.confirm(
      'Do you want to start fresh or copy your existing ChatGPT skills and plugins into Codex Claw?',
      'Stop sharing skills and plugins?',
      {
        cancelButtonText: 'Fresh',
        confirmButtonText: 'Copy',
        distinguishCancelAndClose: true,
        type: 'info',
      },
    );
    return { enabled: false, mode: 'copy' };
  } catch (action) {
    return action === 'cancel' ? { enabled: false, mode: 'fresh' } : null;
  }
}

async function getSystemPermissions(): Promise<SystemPermissionsStatus> {
  return codexClawApi?.getSystemPermissions?.() ?? defaultPermissionsStatus;
}

async function openAccessibilitySettings(): Promise<SystemPermissionsStatus> {
  return codexClawApi?.openAccessibilitySettings?.() ?? defaultPermissionsStatus;
}

async function openScreenRecordingSettings(): Promise<SystemPermissionsStatus> {
  return codexClawApi?.openScreenRecordingSettings?.() ?? defaultPermissionsStatus;
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

.settings-general-panel__codex-binary {
  min-width: 0;
  width: min(520px, 100%);
  display: inline-flex;
  align-items: center;
  justify-self: end;
  justify-content: flex-end;
  gap: var(--space-8);
}

.settings-general-panel__codex-binary :deep(.el-input) {
  min-width: 180px;
  flex: 1 1 auto;
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
