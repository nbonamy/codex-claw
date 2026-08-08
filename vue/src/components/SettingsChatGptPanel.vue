<template>
  <SettingsPanelFrame
    title="ChatGPT"
    title-id="settings-chatgpt-title"
  >
    <div class="settings-chatgpt-panel">
      <div
        class="settings-chatgpt-panel__app-icon"
        aria-label="ChatGPT app"
        role="img"
      >
        <BrandOpenaiIcon aria-hidden="true" />
      </div>

      <div class="settings-chatgpt-panel__copy">
        <h3>Manage Codex settings in ChatGPT</h3>
        <p>
          Install plugins, configure sandbox policies, and manage other Codex settings in the ChatGPT app.
          Launching it here connects ChatGPT to the same Codex home used by Claw.
        </p>
      </div>

      <el-button
        type="primary"
        :loading="launching"
        @click="launch"
      >
        Launch ChatGPT
      </el-button>

      <p
        v-if="launchError"
        class="settings-chatgpt-panel__error"
        role="alert"
      >
        {{ launchError }}
      </p>
    </div>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { BrandOpenaiIcon } from '../shared/icons/app-icons';
import { clawHostActions } from '../platform-api';
import SettingsPanelFrame from './SettingsPanelFrame.vue';

const props = defineProps<{
  launchChatGptApp?: () => Promise<void>;
}>();

const launching = ref(false);
const launchError = ref<string | null>(null);

async function launch(): Promise<void> {
  launchError.value = null;
  launching.value = true;
  try {
    const launchApp = props.launchChatGptApp ?? clawHostActions.launchChatGpt;
    if (!launchApp) {
      throw new Error('ChatGPT could not be launched from this window.');
    }
    await launchApp();
  } catch (error) {
    launchError.value = error instanceof Error ? error.message : String(error);
  } finally {
    launching.value = false;
  }
}
</script>

<style scoped>
.settings-chatgpt-panel {
  min-height: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-16);
  padding: var(--space-32) var(--space-24);
  text-align: center;
}

.settings-chatgpt-panel__app-icon {
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 24px;
  background: var(--color-surface-lowest);
  color: var(--color-text);
  box-shadow: var(--shadow-md);
}

.settings-chatgpt-panel__app-icon svg {
  width: 68px;
  height: 68px;
  stroke-width: 1.5px;
}

.settings-chatgpt-panel__copy {
  max-width: 520px;
}

.settings-chatgpt-panel__copy h3 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-18);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.settings-chatgpt-panel__copy p {
  margin: var(--space-6) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  line-height: var(--line-height-22);
}

.settings-chatgpt-panel__error {
  max-width: 520px;
  margin: 0;
  color: var(--color-error);
  font-size: var(--font-size-13);
  line-height: var(--line-height-20);
}
</style>
