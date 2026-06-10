<template>
  <SettingsPanelFrame
    title="Integrations"
    title-id="settings-integrations-title"
  >
    <template #banner>
      <SettingsIntegrationBanner />
    </template>

    <article class="settings-integrations-panel__integration">
      <div class="settings-integrations-panel__identity">
        <span
          class="settings-integrations-panel__icon"
          aria-hidden="true"
        >
          <img src="https://cdn.brandfetch.io/idZAyF9rlg/theme/dark/symbol.svg?c=1bxid64Mup7aczewSAYMX&t=1779162684348">
        </span>
        <div>
          <strong>GitHub</strong>
          <span>{{ githubDescription }}</span>
        </div>
      </div>

      <div class="settings-integrations-panel__actions">
        <el-button
          v-if="githubConnection.status !== 'connected'"
          :disabled="connectDisabled"
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
      <span class="settings-integrations-panel__authorization-text">Enter this code at {{ authorization.verificationUri }}</span>
      <span class="settings-integrations-panel__code">{{ authorization.userCode }}</span>
      <el-button
        :loading="status === 'loading'"
        type="primary"
        @click="emit('complete', 'github')"
      >
        Finish connection
      </el-button>
    </div>

    <p
      v-if="configurationError || error"
      class="settings-integrations-panel__detail"
    >
      {{ configurationError ?? error ?? githubConnection.detail }}
    </p>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { UpdateSettingsInput, WorkBacklogState, WorkIntegrationConnection, WorkProviderAuthorization, WorkProviderKind } from '../../shared/contracts';
import SettingsIntegrationBanner from './SettingsIntegrationBanner.vue';
import SettingsPanelFrame from './SettingsPanelFrame.vue';

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
}>();

const clientIdInput = ref('');
const configurationError = ref<string | null>(null);
const savingClientId = ref(false);

const githubConnection = computed<WorkIntegrationConnection>(() => (
  props.connections.find((connection) => connection.provider === 'github') ?? {
    provider: 'github',
    status: 'disconnected',
  }
));

const savedClientId = computed(() => props.providerSettings.github?.oauthClientId ?? '');

const clientIdChanged = computed(() => clientIdInput.value.trim() !== savedClientId.value);

const connectDisabled = computed(() => githubConnection.value.status === 'notConfigured' && !clientIdInput.value.trim());

const githubDescription = computed(() => {
  const connection = githubConnection.value;
  if (connection.status === 'connected') {
    return connection.accountLabel ? `Signed in as ${connection.accountLabel}` : 'Signed in';
  }
  if (connection.status === 'connecting') {
    return 'Waiting for authorization';
  }
  if (connection.status === 'notConfigured') {
    return 'Add a client ID to connect';
  }
  return 'Issues and pull requests';
});

watch(savedClientId, (value) => {
  clientIdInput.value = value;
}, { immediate: true });

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
  if (connectDisabled.value) {
    return;
  }

  if (clientIdChanged.value || githubConnection.value.status === 'notConfigured') {
    await saveClientId();
  }
  emit('connect', 'github');
}
</script>

<style scoped>
.settings-integrations-panel__integration {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
  border-bottom: 1px solid var(--color-border);
}

.settings-integrations-panel__identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-10);
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
  margin-left: var(--space-8);
  width: var(--space-16);
  height: var(--space-16);
  display: flex;
  align-items: center;
}

.settings-integrations-panel__icon img {
  width: 100%;
  height: 100%;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-10);
  padding: var(--space-10) 0 0;
}

.settings-integrations-panel__authorization-text {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.settings-integrations-panel__code {
  min-width: 104px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-6) var(--space-8);
  color: var(--color-text);
  background: var(--color-surface-low);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
  text-align: center;
}

.settings-integrations-panel__detail {
  margin: var(--space-8) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}
</style>
