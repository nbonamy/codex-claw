<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsCodexPanel.codex')"
    title-id="settings-codex-title"
  >
    <SettingsSection
      :title="$t('surface.settingsCodexPanel.chatGPT')"
      title-id="settings-codex-chatgpt-title"
    >
      <SettingsRow
        :title="$t('surface.settingsCodexPanel.launchChatGPT')"
        :description="$t('surface.settingsCodexPanel.manageCodexPluginsSkillsAndSandboxPoliciesInChatGPTUsing')"
        :error="launchError"
      >
        <template #control>
          <el-button
            :loading="launching"
            size="small"
            @click="launch"
          > {{ $t('surface.settingsCodexPanel.launchChatGPT') }} </el-button>
        </template>
      </SettingsRow>
      <SettingsRow
        as="label"
        :title="$t('surface.settingsCodexPanel.shareSkillsAndPluginsWithChatGPT')"
        :description="codexResourceSharingDescription"
        :error="codexResourceSharingError"
      >
        <template #control>
          <el-switch
            :model-value="settings.shareCodexSkillsAndPlugins"
            :loading="changingCodexResourceSharing"
            :aria-label="$t('surface.settingsCodexPanel.shareSkillsAndPluginsWithChatGPT')"
            @update:model-value="updateCodexResourceSharing"
          />
        </template>
      </SettingsRow>
    </SettingsSection>

    <SettingsSection
      v-if="clawHostCapabilities.nativeFileDialogs"
      :title="$t('surface.settingsCodexPanel.runtime')"
      title-id="settings-codex-runtime-title"
    >
      <SettingsRow
        :title="$t('surface.settingsCodexPanel.codexExecutable')"
        :description="$t('surface.settingsCodexPanel.leaveEmptyToUseTheBundledCodexChangingThisRestartsCodexC')"
        :error="codexBinaryError"
      >
        <template #control>
          <span class="settings-codex-panel__runtime">
            <el-input
              v-model="codexBinaryDraft"
              :aria-label="$t('surface.settingsCodexPanel.codexExecutablePath')"
              clearable
              :placeholder="$t('surface.settingsCodexPanel.bundledCodex')"
              size="small"
              @change="updateCodexBinaryPath"
              @clear="clearCodexBinaryPath"
            />
            <el-button
              size="small"
              :loading="choosingCodexBinary"
              @click="chooseCodexBinary"
            > {{ $t('surface.settingsCodexPanel.choose') }} </el-button>
            <el-button
              v-if="settings.codexBinaryPath"
              size="small"
              @click="clearCodexBinaryPath"
            > {{ $t('surface.settingsCodexPanel.clear') }} </el-button>
          </span>
        </template>
      </SettingsRow>
    </SettingsSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { translate } from '../i18n';
import { ElMessageBox } from 'element-plus';
import { computed, ref, watch } from 'vue';
import type { AppGeneralSettings, SetCodexResourceSharingInput, UpdateSettingsInput } from '@codex-claw/core/contracts';
import { clawHostCapabilities, clawPlatformActions } from '../platform-api';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';

const props = defineProps<{
  chooseCodexBinary?: () => Promise<string | null>;
  codexResourceSharingBlocked?: boolean;
  launchChatGptApp?: () => Promise<void>;
  setCodexResourceSharing?: (input: SetCodexResourceSharingInput) => Promise<void>;
  settings: AppGeneralSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();

const launching = ref(false);
const launchError = ref<string | null>(null);
const choosingCodexBinary = ref(false);
const codexBinaryError = ref<string | null>(null);
const codexBinaryDraft = ref(props.settings.codexBinaryPath);
const changingCodexResourceSharing = ref(false);
const codexResourceSharingError = ref<string | null>(null);

const codexResourceSharingDescription = computed(() => props.codexResourceSharingBlocked
  ? translate('surface.settingsCodexPanel.thisOptionCannotBeChangedWhileChatsAreRunning')
  : translate('surface.settingsCodexPanel.useTheSameSkillsAndPluginsAsChatGPTChangingThisRestartsT'));

watch(() => props.settings.codexBinaryPath, (path) => {
  codexBinaryDraft.value = path;
});

async function launch(): Promise<void> {
  launchError.value = null;
  launching.value = true;
  try {
    const launchApp = props.launchChatGptApp ?? clawPlatformActions.launchChatGpt;
    await launchApp();
  } catch (error) {
    launchError.value = error instanceof Error ? error.message : String(error);
  } finally {
    launching.value = false;
  }
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
      translate('surface.settingsCodexPanel.thisOptionCannotBeChangedWhileChatsAreRunningWaitForEver'),
      translate('surface.settingsCodexPanel.chatsAreRunning'),
      {
        confirmButtonText: translate('common.ok'),
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
      translate('surface.settingsCodexPanel.youAreGoingToLoseAllPluginsAndSkillsInstalledOnlyInCodex'),
      translate('surface.settingsCodexPanel.shareSkillsAndPluginsWithChatGPT2'),
      {
        cancelButtonText: translate('common.cancel'),
        confirmButtonText: translate('common.continue'),
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
      translate('surface.settingsCodexPanel.doYouWantToStartFreshOrCopyYourExistingChatGPTSkillsAndP'),
      translate('surface.settingsCodexPanel.stopSharingSkillsAndPlugins'),
      {
        cancelButtonText: translate('common.fresh'),
        confirmButtonText: translate('common.copy'),
        distinguishCancelAndClose: true,
        type: 'info',
      },
    );
    return { enabled: false, mode: 'copy' };
  } catch (action) {
    return action === 'cancel' ? { enabled: false, mode: 'fresh' } : null;
  }
}
</script>

<style scoped>
.settings-codex-panel__runtime {
  min-width: 0;
  width: min(520px, 100%);
  display: inline-flex;
  align-items: center;
  justify-self: end;
  justify-content: flex-end;
  gap: var(--space-8);
}

.settings-codex-panel__runtime :deep(.el-input) {
  min-width: 180px;
  flex: 1 1 auto;
}
</style>
