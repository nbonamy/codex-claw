<template>
  <SettingsPanelFrame
    title="Codex"
    title-id="settings-codex-title"
  >
    <SettingsSection
      title="ChatGPT"
      title-id="settings-codex-chatgpt-title"
    >
      <SettingsRow
        title="Launch ChatGPT"
        description="Manage Codex plugins, skills, and sandbox policies in ChatGPT using the same Codex home as Claw."
        :error="launchError"
      >
        <template #control>
          <el-button
            :loading="launching"
            size="small"
            @click="launch"
          >
            Launch ChatGPT
          </el-button>
        </template>
      </SettingsRow>
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
    </SettingsSection>

    <SettingsSection
      v-if="clawHostCapabilities.nativeFileDialogs"
      title="Runtime"
      title-id="settings-codex-runtime-title"
    >
      <SettingsRow
        title="Codex executable"
        description="Leave empty to use the bundled Codex. Changing this restarts Codex Claw."
        :error="codexBinaryError"
      >
        <template #control>
          <span class="settings-codex-panel__runtime">
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
  ? 'This option cannot be changed while chats are running.'
  : 'Use the same skills and plugins as ChatGPT. Changing this restarts the backend.');

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
