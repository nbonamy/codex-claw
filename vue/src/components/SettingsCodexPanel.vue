<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsCodexPanel.codex')"
    title-id="settings-codex-title"
  >
    <SettingsEngineConnectionRow :authentication="authentication" :connected="connected" :enabled="settings.providerEnabled?.codex !== false" :set-enabled="setEnabled" :busy="connectionBusy" :pending="loginPending" :error="connectionError" @connect="emit('connect')" @disconnect="emit('disconnect')" @cancel="emit('cancel')">
      <SettingsEngineSetupRow :home="settings.providerHomes?.codex" @customize="emit('customize')" />
    </SettingsEngineConnectionRow>
    <FormSection
      :title="$t('surface.settingsCodexPanel.chatGPT')"
      title-id="settings-codex-chatgpt-title"
    >
      <FormRow
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
      </FormRow>
    </FormSection>

    <FormSection
      v-if="appHostCapabilities.nativeFileDialogs"
      :title="$t('surface.settingsCodexPanel.runtime')"
      title-id="settings-codex-runtime-title"
    >
      <FormRow
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
      </FormRow>
    </FormSection>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { AppGeneralSettings, UpdateSettingsInput } from '@workspace/core/contracts';
import { appHostCapabilities, appPlatformActions } from '../platform-api';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import FormRow from '../shared/form/FormRow.vue';
import FormSection from '../shared/form/FormSection.vue';
import SettingsEngineConnectionRow from './SettingsEngineConnectionRow.vue';
import SettingsEngineSetupRow from './SettingsEngineSetupRow.vue';
import type { ProviderAuthentication } from '@workspace/core/contracts/provider-setup';

const emit = defineEmits<{ connect: []; disconnect: []; cancel: []; customize: [] }>();

const props = defineProps<{
  connected?: boolean;
  authentication?: ProviderAuthentication;
  setEnabled?: (enabled: boolean) => unknown;
  connectionBusy?: boolean;
  loginPending?: boolean;
  connectionError?: string | null;
  chooseCodexBinary?: () => Promise<string | null>;
  launchChatGptApp?: () => Promise<void>;
  settings: AppGeneralSettings;
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>();

const launching = ref(false);
const launchError = ref<string | null>(null);
const choosingCodexBinary = ref(false);
const codexBinaryError = ref<string | null>(null);
const codexBinaryDraft = ref(props.settings.codexBinaryPath);

watch(() => props.settings.codexBinaryPath, (path) => {
  codexBinaryDraft.value = path;
});

async function launch(): Promise<void> {
  launchError.value = null;
  launching.value = true;
  try {
    const launchApp = props.launchChatGptApp ?? appPlatformActions.launchChatGpt;
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
