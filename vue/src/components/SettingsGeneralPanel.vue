<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsGeneralPanel.general')"
    title-id="settings-general-title"
  >
    <SettingsSection
      :title="$t('surface.settingsGeneralPanel.behavior')"
      title-id="settings-general-behavior-title"
    >
      <SettingsRow
        v-if="clawHostCapabilities.daemonManagement"
        as="label"
        :title="$t('surface.settingsGeneralPanel.preventSleepWhileAgentsRun')"
        :description="$t('surface.settingsGeneralPanel.keepThisComputerAwakeWhileAnAgentIsActive')"
      >
        <template #control>
          <el-switch
            :model-value="settings.preventSleepWhenAgentsRun"
            :aria-label="$t('surface.settingsGeneralPanel.preventSleepWhileAgentsRun')"
            @update:model-value="updatePreventSleep"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        v-if="clawHostCapabilities.daemonManagement"
        as="label"
        :title="$t('surface.settingsGeneralPanel.keepCodexClawReadyInTheBackground')"
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
              :aria-label="$t('surface.settingsGeneralPanel.keepCodexClawReadyInTheBackground')"
              @update:model-value="updateDaemonEnabled"
            />
          </span>
        </template>
      </SettingsRow>
      <SettingsRow
        as="label"
        :title="$t('surface.settingsGeneralPanel.agentCelebrations')"
        :description="$t('surface.settingsGeneralPanel.letAgentsCelebrateMeaningfulWinsWithVisualEffects')"
      >
        <template #control>
          <el-switch
            :model-value="settings.celebrationsEnabled"
            :aria-label="$t('surface.settingsGeneralPanel.agentCelebrations')"
            @update:model-value="updateCelebrationsEnabled"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        :title="$t('surface.settingsGeneralPanel.worktreeInitialization')"
        :description="$t('surface.settingsGeneralPanel.prepareNewWorktreesBeforeAgentsStart')"
      >
        <template #control>
          <el-select
            class="settings-general-panel__worktree-select"
            :model-value="settings.worktreeInitializationMode"
            :aria-label="$t('surface.settingsGeneralPanel.worktreeInitialization')"
            @update:model-value="updateWorktreeInitializationMode"
          >
            <el-option
              :label="$t('surface.settingsGeneralPanel.worktreeInitializationAutomatic')"
              value="automatic"
            />
            <el-option
              :label="$t('surface.settingsGeneralPanel.worktreeInitializationRepository')"
              value="repository"
            />
            <el-option
              :label="$t('surface.settingsGeneralPanel.worktreeInitializationDisabled')"
              value="off"
            />
          </el-select>
        </template>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      :title="$t('surface.settingsGeneralPanel.voice')"
      title-id="settings-general-voice-title"
    >
      <SettingsRow
        as="label"
        :title="$t('surface.settingsGeneralPanel.spokenAcknowledgments')"
        :description="$t('surface.settingsGeneralPanel.letAgentsSpeakBriefTaskStartAndFinishPhrases')"
      >
        <template #control>
          <el-switch
            :model-value="settings.spokenAnnouncementsEnabled"
            :aria-label="$t('surface.settingsGeneralPanel.spokenAcknowledgments')"
            @update:model-value="updateSpokenAnnouncementsEnabled"
          />
        </template>
      </SettingsRow>
      <SettingsRow
        v-if="settings.spokenAnnouncementsEnabled"
        :title="$t('surface.settingsGeneralPanel.voice')"
        :description="$t('surface.settingsGeneralPanel.chooseAnOnDeviceNeuralVoice')"
        :error="voicePreviewError"
      >
        <template #control>
          <span class="settings-general-panel__actions">
            <el-select
              class="settings-general-panel__voice-select"
              :model-value="settings.spokenAnnouncementVoice"
              :aria-label="$t('surface.settingsGeneralPanel.voice')"
              @update:model-value="updateSpokenAnnouncementVoice"
            >
              <el-option
                v-for="option in voiceOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <el-button
              size="small"
              :loading="previewingVoice"
              :disabled="previewingVoice"
              :aria-label="$t('surface.settingsGeneralPanel.previewVoice')"
              @click="previewVoice"
            >
              {{ $t('surface.settingsGeneralPanel.preview') }}
            </el-button>
          </span>
        </template>
      </SettingsRow>
      <details
        v-if="settings.spokenAnnouncementsEnabled"
        class="settings-general-panel__voice-rules"
      >
        <summary class="settings-general-panel__voice-rules-summary">
          <span class="settings-general-panel__voice-rules-copy">
            <strong>{{ $t('surface.settingsGeneralPanel.playbackRules') }}</strong>
            <span>{{ voiceRulesSummary }}</span>
          </span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div class="settings-general-panel__voice-rules-content">
          <SettingsRow
            :title="$t('surface.settingsGeneralPanel.scope')"
            :description="$t('surface.settingsGeneralPanel.chooseWhichAgentsMaySpeak')"
          >
            <template #control>
              <el-select
                class="settings-general-panel__speech-scope-select"
                :model-value="settings.spokenAnnouncementScope"
                :aria-label="$t('surface.settingsGeneralPanel.spokenAcknowledgmentScope')"
                @update:model-value="updateSpokenAnnouncementScope"
              >
                <el-option
                  :label="$t('surface.settingsGeneralPanel.selectedAgentOnly')"
                  value="selected"
                />
                <el-option
                  :label="$t('surface.settingsGeneralPanel.allAgents')"
                  value="all"
                />
              </el-select>
            </template>
          </SettingsRow>
          <SettingsRow
            as="label"
            :title="$t('surface.settingsGeneralPanel.dictatedPromptsOnly')"
            :description="$t('surface.settingsGeneralPanel.speakOnlyForTasksStartedWithVoiceDictation')"
          >
            <template #control>
              <el-switch
                :model-value="settings.spokenAnnouncementsOnlyForDictatedPrompts"
                :aria-label="$t('surface.settingsGeneralPanel.dictatedPromptsOnly')"
                @update:model-value="updateSpokenAnnouncementsOnlyForDictatedPrompts"
              />
            </template>
          </SettingsRow>
          <SettingsRow
            as="label"
            :title="$t('surface.settingsGeneralPanel.onlySpeakWhileFocused')"
            :description="$t('surface.settingsGeneralPanel.silenceAcknowledgmentsWhileCodexClawIsInTheBackground')"
          >
            <template #control>
              <el-switch
                :model-value="settings.spokenAnnouncementsOnlyWhenFocused"
                :aria-label="$t('surface.settingsGeneralPanel.onlySpeakWhileFocused')"
                @update:model-value="updateSpokenAnnouncementsOnlyWhenFocused"
              />
            </template>
          </SettingsRow>
        </div>
      </details>
    </SettingsSection>

    <SettingsSection
      v-if="clawHostCapabilities.nativeFileDialogs && showSourceFolderSetting"
      :title="$t('surface.settingsGeneralPanel.sourceFolder')"
      title-id="settings-general-source-title"
    >
      <SettingsRow
        :title="$t('surface.settingsGeneralPanel.sourceFolder')"
        :description="$t('surface.settingsGeneralPanel.discoverRepositoriesAndWorktreesWhenCreatingAgents')"
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
            > {{ $t('surface.settingsGeneralPanel.choose') }} </el-button>
            <el-button
              v-if="sourceFolderState.path"
              size="small"
              @click="clearSourceFolder"
            > {{ $t('surface.settingsGeneralPanel.clear') }} </el-button>
          </span>
        </template>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      v-if="clawHostCapabilities.systemPermissions"
      :title="$t('surface.settingsGeneralPanel.systemPermissions')"
      title-id="settings-general-permissions-title"
    >
      <SettingsRow
        :title="$t('surface.settingsGeneralPanel.accessibility')"
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
            > {{ $t('surface.settingsGeneralPanel.grant') }} </el-button>
            <el-button
              v-else-if="permissions?.accessibility.required"
              :loading="loadingPermissions"
              size="small"
              @click="loadPermissions"
            > {{ $t('surface.settingsGeneralPanel.refresh') }} </el-button>
          </span>
        </template>
      </SettingsRow>
      <SettingsRow
        :title="$t('surface.settingsGeneralPanel.screenRecording')"
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
            > {{ $t('surface.settingsGeneralPanel.grant') }} </el-button>
            <el-button
              v-else-if="permissions?.screenRecording.required"
              :loading="loadingPermissions"
              size="small"
              @click="loadPermissions"
            > {{ $t('surface.settingsGeneralPanel.refresh') }} </el-button>
          </span>
        </template>
      </SettingsRow>
    </SettingsSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { ElMessageBox } from 'element-plus';
import { computed, onMounted, ref } from 'vue';
import type { AppGeneralSettings, ClawdDaemonStatus, SourceFolderState, SpokenAnnouncementScope, SpokenAnnouncementVoice, SystemPermissionsStatus, UpdateSettingsInput, WorktreeInitializationMode } from '@codex-claw/core/contracts';
import { defaultSourceFolderState } from '@codex-claw/core/settings';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';
import { ChevronDown, Circle, ShieldCheckIcon } from '../shared/icons/app-icons';
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
  chooseSourceFolder?: () => Promise<string | null>;
  daemonStatus?: ClawdDaemonStatus | null;
  daemonStatusError?: string | null;
  getSystemPermissions?: () => Promise<SystemPermissionsStatus>;
  openAccessibilitySettings?: () => Promise<SystemPermissionsStatus>;
  openScreenRecordingSettings?: () => Promise<SystemPermissionsStatus>;
  restartApp?: () => Promise<void>;
  setDaemonEnabled?: (enabled: boolean) => Promise<void>;
  settings: AppGeneralSettings;
  sourceFolder?: SourceFolderState;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();

const permissions = ref<SystemPermissionsStatus | null>(null);
const loadingPermissions = ref(false);
const openingAccessibilitySettings = ref(false);
const openingScreenRecordingSettings = ref(false);
const choosingSourceFolder = ref(false);
const settingDaemon = ref(false);
const daemonOperation = ref<'installing' | 'uninstalling' | null>(null);
const sourceFolderError = ref<string | null>(null);
const previewingVoice = ref(false);
const voicePreviewError = ref<string | null>(null);
const voiceOptions: Array<{ label: string; value: SpokenAnnouncementVoice }> = [
  { label: translate('surface.settingsGeneralPanel.voiceHeart'), value: 'af_heart' },
  { label: translate('surface.settingsGeneralPanel.voiceBella'), value: 'af_bella' },
  { label: translate('surface.settingsGeneralPanel.voiceNicole'), value: 'af_nicole' },
  { label: translate('surface.settingsGeneralPanel.voiceSarah'), value: 'af_sarah' },
  { label: translate('surface.settingsGeneralPanel.voiceAdam'), value: 'am_adam' },
  { label: translate('surface.settingsGeneralPanel.voiceMichael'), value: 'am_michael' },
  { label: translate('surface.settingsGeneralPanel.voiceEmma'), value: 'bf_emma' },
  { label: translate('surface.settingsGeneralPanel.voiceGeorge'), value: 'bm_george' },
];
const voiceRulesSummary = computed(() => [
  translate(props.settings.spokenAnnouncementScope === 'all'
    ? 'surface.settingsGeneralPanel.allAgents'
    : 'surface.settingsGeneralPanel.selectedAgentOnly'),
  translate(props.settings.spokenAnnouncementsOnlyForDictatedPrompts
    ? 'surface.settingsGeneralPanel.dictatedPrompts'
    : 'surface.settingsGeneralPanel.allPrompts'),
  translate(props.settings.spokenAnnouncementsOnlyWhenFocused
    ? 'surface.settingsGeneralPanel.whileFocused'
    : 'surface.settingsGeneralPanel.inTheBackgroundToo'),
].join(' · '));

const showSourceFolderSetting = computed(() => Boolean(props.sourceFolder));
const sourceFolderState = computed(() => props.sourceFolder ?? defaultSourceFolderState);
const sourceFolderLabel = computed(() => sourceFolderState.value.path || translate('dynamic.misc.notConfigured'));
const daemonEnabled = computed(() => props.daemonStatus?.installed ?? false);
const daemonRunning = computed(() => props.daemonStatus?.running ?? false);
const daemonSwitchDisabled = computed(() => settingDaemon.value || props.daemonStatus?.supported !== true);
const daemonStatusLabel = computed(() => {
  if (daemonOperation.value === 'installing') {
    return translate('surface.settingsGeneralPanel.installing');
  }
  if (daemonOperation.value === 'uninstalling') {
    return translate('surface.settingsGeneralPanel.uninstalling');
  }
  if (!props.daemonStatus) {
    return translate('surface.settingsGeneralPanel.checking');
  }
  if (!props.daemonStatus.supported) {
    return translate('surface.settingsGeneralPanel.unavailable');
  }
  if (props.daemonStatus.running) {
    return translate('surface.settingsGeneralPanel.running');
  }
  return props.daemonStatus.installed ? translate('surface.settingsGeneralPanel.installed') : translate('surface.settingsGeneralPanel.off');
});
const daemonDescription = computed(() => {
  if (props.daemonStatus?.supported === false) {
    return props.daemonStatus.detail ?? translate('dynamic.misc.installAvailable');
  }
  return translate('surface.settingsGeneralPanel.startTheCodexClawAgentToKeepYourAutomationsRunning');
});
const accessibilityGranted = computed(() => permissions.value?.accessibility.trusted ?? false);
const showAccessibilityGrantButton = computed(() => permissions.value?.accessibility.required === true && !accessibilityGranted.value);
const screenRecordingGranted = computed(() => permissions.value?.screenRecording.trusted ?? false);
const showScreenRecordingGrantButton = computed(() => permissions.value?.screenRecording.required === true && !screenRecordingGranted.value);
const accessibilityStatusLabel = computed(() => {
  if (!permissions.value) {
    return translate('surface.settingsGeneralPanel.checking');
  }

  if (!permissions.value.accessibility.required) {
    return translate('surface.settingsGeneralPanel.notNeeded');
  }

  return accessibilityGranted.value ? translate('surface.settingsGeneralPanel.granted') : translate('surface.settingsGeneralPanel.required');
});
const accessibilityDescription = computed(() => {
  if (permissions.value?.accessibility.required === false) {
    return translate('surface.settingsGeneralPanel.computerUseDoesNotNeedThisPermissionOnThisPlatform');
  }

  return translate('surface.settingsGeneralPanel.requiredForComputerUseToInspectAndClickCodexClaw');
});
const screenRecordingStatusLabel = computed(() => {
  if (!permissions.value) {
    return translate('surface.settingsGeneralPanel.checking');
  }

  if (!permissions.value.screenRecording.required) {
    return translate('surface.settingsGeneralPanel.notNeeded');
  }

  return screenRecordingGranted.value ? translate('surface.settingsGeneralPanel.granted') : translate('surface.settingsGeneralPanel.required');
});
const screenRecordingDescription = computed(() => {
  if (permissions.value?.screenRecording.required === false) {
    return translate('surface.settingsGeneralPanel.appshotsDoNotNeedThisPermissionOnThisPlatform');
  }

  return translate('surface.settingsGeneralPanel.requiredForAppshotsToCaptureTheFrontmostWindow');
});

onMounted(() => {
  if (clawHostCapabilities.systemPermissions) void loadPermissions();
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

function updateCelebrationsEnabled(value: boolean | string | number): void {
  void props.updateSettings?.({
    general: {
      celebrationsEnabled: value === true,
    },
  });
}

function updateSpokenAnnouncementsEnabled(value: boolean | string | number): void {
  void props.updateSettings?.({
    general: {
      spokenAnnouncementsEnabled: value === true,
    },
  });
}

function updateSpokenAnnouncementScope(value: SpokenAnnouncementScope): void {
  void props.updateSettings?.({
    general: { spokenAnnouncementScope: value },
  });
}

function updateSpokenAnnouncementsOnlyForDictatedPrompts(value: boolean | string | number): void {
  void props.updateSettings?.({
    general: { spokenAnnouncementsOnlyForDictatedPrompts: value === true },
  });
}

function updateSpokenAnnouncementsOnlyWhenFocused(value: boolean | string | number): void {
  void props.updateSettings?.({
    general: { spokenAnnouncementsOnlyWhenFocused: value === true },
  });
}

function updateSpokenAnnouncementVoice(value: SpokenAnnouncementVoice): void {
  voicePreviewError.value = null;
  void props.updateSettings?.({
    general: { spokenAnnouncementVoice: value },
  });
}

async function previewVoice(): Promise<void> {
  voicePreviewError.value = null;
  previewingVoice.value = true;
  try {
    const result = await codexClawApi?.previewSpokenAnnouncementVoice?.(
      props.settings.spokenAnnouncementVoice,
    );
    if (!result?.queued) {
      voicePreviewError.value = translate('surface.settingsGeneralPanel.voicePreviewUnavailable');
    }
  } catch {
    voicePreviewError.value = translate('surface.settingsGeneralPanel.voicePreviewUnavailable');
  } finally {
    previewingVoice.value = false;
  }
}

function updateWorktreeInitializationMode(value: WorktreeInitializationMode): void {
  void props.updateSettings?.({
    general: { worktreeInitializationMode: value },
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
        ? translate('surface.settingsGeneralPanel.codexClawNeedsToRestartToConnectToTheBackgroundAgent')
        : translate('surface.settingsGeneralPanel.codexClawNeedsToRestartToUseTheInAppAgent'),
      translate('surface.settingsGeneralPanel.restartCodexClaw'),
      {
        cancelButtonText: translate('common.later'),
        confirmButtonText: translate('dynamic.misc.restartNow'),
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
.settings-general-panel__worktree-select {
  width: 280px;
  max-width: 100%;
}

.settings-general-panel__speech-scope-select {
  width: 220px;
  max-width: 100%;
}

.settings-general-panel__voice-select {
  width: 190px;
}

.settings-general-panel__voice-rules {
  border-top: 1px solid var(--color-border);
}

.settings-general-panel__voice-rules-summary {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
  padding: var(--space-10) var(--space-12);
  cursor: pointer;
  list-style: none;
}

.settings-general-panel__voice-rules-summary::-webkit-details-marker {
  display: none;
}

.settings-general-panel__voice-rules-summary svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  color: var(--color-text-muted);
  transition: transform 120ms ease;
}

.settings-general-panel__voice-rules[open] .settings-general-panel__voice-rules-summary svg {
  transform: rotate(180deg);
}

.settings-general-panel__voice-rules-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.settings-general-panel__voice-rules-copy strong {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-22);
}

.settings-general-panel__voice-rules-copy span {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-general-panel__voice-rules-content {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface-low);
}

.settings-general-panel__voice-rules-content :deep(.settings-row + .settings-row) {
  border-top: 1px solid var(--color-border);
}

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
