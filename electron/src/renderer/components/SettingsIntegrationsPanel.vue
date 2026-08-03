<template>
  <SettingsPanelFrame
    title="Integrations"
    title-id="settings-integrations-title"
  >
    <template #banner>
      <SettingsIntegrationBanner />
    </template>

    <SettingsSection>
      <article class="settings-integrations-panel__integration">
        <div class="settings-integrations-panel__identity">
          <span
            class="settings-integrations-panel__icon"
            aria-hidden="true"
          >
            <GitHubIcon size="var(--icon-xl)" />
          </span>
          <div>
            <strong>GitHub</strong>
            <span>{{ githubDescription }}</span>
          </div>
        </div>

        <div class="settings-integrations-panel__actions">
          <el-button
            v-if="githubConnection.status !== 'connected'"
            :loading="status === 'loading'"
            size="small"
            type="primary"
            @click="connectGithub"
          >
            Connect
          </el-button>
          <template v-else>
            <span class="settings-integrations-panel__connected">Connected</span>
            <el-button
              size="small"
              @click="emit('disconnect', 'github')"
            >
              Disconnect
            </el-button>
          </template>
        </div>
      </article>

      <!-- <div
        v-if="githubConnection.status !== 'connected'"
        class="settings-integrations-panel__config"
      >
        <label for="github-client-id">Client ID</label>
        <div class="settings-integrations-panel__config-row">
          <el-input
            id="github-client-id"
            v-model="clientIdInput"
            autocomplete="off"
            placeholder="GitHub OAuth or App client ID"
            size="small"
            spellcheck="false"
          />
          <el-button
            :disabled="!clientIdChanged"
            :loading="savingClientId"
            size="small"
            @click="saveClientId"
          >
            Save
          </el-button>
        </div>
      </div> -->

      <div
        v-if="authorization?.provider === 'github' && githubConnection.status === 'connecting'"
        class="settings-integrations-panel__authorization"
      >
        <ol class="settings-integrations-panel__authorization-steps">
        <li class="settings-integrations-panel__authorization-step">
          <div class="settings-integrations-panel__authorization-step-copy">
            <div class="settings-integrations-panel__authorization-step-text">
              <strong>Step 1: Copy the code</strong>
              <span>Click the code to copy it.</span>
            </div>
            <button
              class="settings-integrations-panel__code"
              type="button"
              :aria-label="`Copy GitHub device code ${authorization.userCode}`"
              @click="copyAuthorizationCode"
            >
              <span>{{ authorization.userCode }}</span>
              <component
                :is="copyIconConfirmed ? CheckIcon : CopyIcon"
                aria-hidden="true"
                size="16"
              />
            </button>
          </div>
        </li>
        <li class="settings-integrations-panel__authorization-step">
          <div class="settings-integrations-panel__authorization-step-text">
            <strong>Step 2: Open GitHub</strong>
            <span>GitHub will ask for the code. Paste it there, authorize Codex Claw, then come back here.</span>
          </div>
          <el-button
            :type="codeCopied ? 'primary' : undefined"
            @click="emit('open-authorization', 'github')"
          >
            Open GitHub
          </el-button>
        </li>
        <li class="settings-integrations-panel__authorization-step">
          <div class="settings-integrations-panel__authorization-step-text">
            <strong>Step 3: Come back here</strong>
            <span>Codex Claw will finish the connection automatically once GitHub approves it.</span>
          </div>
          <span
            class="settings-integrations-panel__waiting"
            aria-label="Waiting for GitHub authorization"
          >
            Waiting...
          </span>
        </li>
        </ol>
      </div>
    </SettingsSection>

    <p
      v-if="configurationError || error"
      class="settings-integrations-panel__detail"
    >
      {{ configurationError ?? error }}
    </p>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { UpdateSettingsInput, WorkBacklogState, WorkIntegrationConnection, WorkProviderAuthorization, WorkProviderKind } from '@codex-claw/shared/contracts';
import { CheckIcon, CopyIcon, GitHubIcon } from '../shared/icons/app-icons';
import SettingsIntegrationBanner from './SettingsIntegrationBanner.vue';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsSection from './SettingsSection.vue';

const props = withDefaults(defineProps<{
  authorization?: WorkProviderAuthorization | null;
  connections: WorkIntegrationConnection[];
  error?: string | null;
  providerSettings?: WorkBacklogState['providerSettings'];
  status?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  updateSettings?: (input: UpdateSettingsInput) => Promise<void>;
}>(), {
  authorization: null,
  error: null,
  providerSettings: () => ({}),
  status: 'notLoaded',
  updateSettings: async () => undefined,
});

const emit = defineEmits<{
  complete: [provider: WorkProviderKind];
  connect: [provider: WorkProviderKind];
  disconnect: [provider: WorkProviderKind];
  'open-authorization': [provider: WorkProviderKind];
}>();

const clientIdInput = ref('');
const configurationError = ref<string | null>(null);
const copyIconConfirmed = ref(false);
const codeCopied = ref(false);
const savingClientId = ref(false);

const githubConnection = computed<WorkIntegrationConnection>(() => (
  props.connections.find((connection) => connection.provider === 'github') ?? {
    provider: 'github',
    status: 'disconnected',
  }
));

const savedClientId = computed(() => props.providerSettings.github?.oauthClientId ?? '');

const clientIdChanged = computed(() => clientIdInput.value.trim() !== savedClientId.value);

const githubDescription = computed(() => {
  const connection = githubConnection.value;
  if (connection.status === 'connected') {
    return connection.accountLabel ? `Signed in as ${connection.accountLabel}` : 'Signed in';
  }
  if (connection.status === 'connecting') {
    return 'Waiting for authorization';
  }
  if (connection.status === 'notConfigured') {
    return 'GitHub OAuth is not configured';
  }
  return 'Issues and pull requests';
});

watch(savedClientId, (value) => {
  clientIdInput.value = value;
}, { immediate: true });

watch(() => props.authorization?.userCode, () => {
  copyIconConfirmed.value = false;
  codeCopied.value = false;
});

async function saveClientId(): Promise<void> {
  savingClientId.value = true;
  configurationError.value = null;
  try {
    await props.updateSettings({
      workProviders: {
        github: {
          oauthClientId: clientIdInput.value.trim(),
        },
      },
    });
  } catch (error) {
    configurationError.value = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    savingClientId.value = false;
  }
}

async function connectGithub(): Promise<void> {
  if (clientIdChanged.value) {
    await saveClientId();
  }
  emit('connect', 'github');
}

async function copyAuthorizationCode(): Promise<void> {
  if (!props.authorization) {
    return;
  }

  try {
    await navigator.clipboard.writeText(props.authorization.userCode);
    copyIconConfirmed.value = true;
    codeCopied.value = true;
    window.setTimeout(() => {
      copyIconConfirmed.value = false;
    }, 1400);
  } catch {
    copyIconConfirmed.value = false;
    codeCopied.value = false;
  }
}
</script>

<style scoped>
.settings-integrations-panel__integration {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  padding: var(--space-10) var(--space-12);
}

.settings-integrations-panel__identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.settings-integrations-panel__identity strong,
.settings-integrations-panel__identity span {
  display: block;
}

.settings-integrations-panel__identity strong {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.settings-integrations-panel__identity span {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.settings-integrations-panel__icon {
  width: var(--space-16);
  height: var(--space-16);
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-integrations-panel__actions {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.settings-integrations-panel__config {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-10) 0 0;
}

.settings-integrations-panel__config label {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.settings-integrations-panel__config-row {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.settings-integrations-panel__connected {
  color: var(--color-success);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
}

.settings-integrations-panel__authorization {
  padding: var(--space-16) var(--space-8) 0;
}

.settings-integrations-panel__authorization-steps {
  margin: 0;
  padding: 0;
  list-style: none;
}

.settings-integrations-panel__authorization-step {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
  min-height: 68px;
  border-top: 1px solid var(--color-border);
  padding: var(--space-12) 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.settings-integrations-panel__authorization-step:first-child {
  border-top: 0;
}

.settings-integrations-panel__authorization-step-text {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-2);
}

.settings-integrations-panel__authorization-step-text strong {
  color: var(--color-text);
  font-weight: var(--font-weight-semibold);
}

.settings-integrations-panel__authorization-step-text span {
  color: var(--color-text-muted);
}

.settings-integrations-panel__authorization-step-copy {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-16);
}

.settings-integrations-panel__authorization-expiry {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
  margin: var(--space-10) 0 0;
}

.settings-integrations-panel__code {
  min-width: 128px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  color: var(--color-text);
  background: var(--color-surface-low);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
  text-align: center;
  cursor: pointer;
}

.settings-integrations-panel__code:hover {
  background: var(--color-surface-high);
}

.settings-integrations-panel__waiting {
  flex: 0 0 auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
}

.settings-integrations-panel__detail {
  margin: var(--space-8) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}
</style>
