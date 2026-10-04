<template>
  <SettingsPanelFrame
    :title="$t('surface.settingsIntegrationsPanel.integrations')"
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
            <strong>{{ $t('surface.settingsIntegrationsPanel.gitHub') }}</strong>
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
          > {{ $t('surface.settingsIntegrationsPanel.connect') }} </el-button>
          <template v-else>
            <span class="settings-integrations-panel__connected">{{ $t('surface.settingsIntegrationsPanel.connected') }}</span>
            <el-button
              size="small"
              @click="emit('disconnect', 'github')"
            > {{ $t('surface.settingsIntegrationsPanel.disconnect') }} </el-button>
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
            :placeholder="$t('surface.settingsIntegrationsPanel.gitHubOAuthOrAppClientId')"
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
        <GitHubAuthorizationSteps
          :authorization="authorization"
          @open="emit('open-authorization', 'github')"
        />
      </div>
    </SettingsSection>

    <SettingsSection>
      <SettingsRow :title="$t('linearIntegration.name')" :description="linearDescription" :error="linearError">
        <template #control>
          <el-button v-if="linearConnection.status === 'connected'" size="small" :aria-label="$t('linearIntegration.disconnectLabel')" @click="emit('disconnect', 'linear')">{{ $t('surface.settingsIntegrationsPanel.disconnect') }}</el-button>
          <el-button v-else-if="linearConnection.status === 'connecting'" size="small" :aria-label="$t('linearIntegration.cancelLabel')" @click="emit('disconnect', 'linear')">{{ $t('linearIntegration.cancel') }}</el-button>
          <el-button v-else size="small" type="primary" :aria-label="$t('linearIntegration.connectLabel')" :loading="status === 'loading'" @click="emit('connect', 'linear')">{{ $t('surface.settingsIntegrationsPanel.connect') }}</el-button>
        </template>
      </SettingsRow>
      <SettingsRow v-if="authorization?.provider === 'linear' && linearConnection.status === 'connecting'" :title="$t('linearIntegration.authorize')" :description="$t('linearIntegration.returnToClaw')">
        <template #control>
          <el-button size="small" type="primary" :aria-label="$t('linearIntegration.openLabel')" @click="emit('open-authorization', 'linear')">{{ $t('linearIntegration.open') }}</el-button>
        </template>
      </SettingsRow>
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
import { translate } from '../i18n';
import { computed, ref, watch } from 'vue';
import type { UpdateSettingsInput, WorkBacklogState, WorkIntegrationConnection, WorkProviderAuthorization, WorkProviderKind } from '@codex-claw/core/contracts';
import { GitHubIcon } from '../shared/icons/app-icons';
import GitHubAuthorizationSteps from './GitHubAuthorizationSteps.vue';
import SettingsIntegrationBanner from './SettingsIntegrationBanner.vue';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import SettingsSection from './SettingsSection.vue';
import SettingsRow from './SettingsRow.vue';
import { localizedText } from '../i18n/errors';

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
const savingClientId = ref(false);
const linearConnection = computed<WorkIntegrationConnection>(() => props.connections.find(connection => connection.provider === 'linear') ?? { provider: 'linear', status: 'notConfigured' });
const linearDescription = computed(() => {
  if (linearConnection.value.status === 'connected') return [translate('surface.settingsIntegrationsPanel.connected'), linearConnection.value.accountLabel].filter(Boolean).join(' · ');
  if (linearConnection.value.status === 'connecting') return translate('surface.settingsIntegrationsPanel.waitingForAuthorization');
  return translate('linearIntegration.setup');
});
const linearError = computed(() => linearConnection.value.status === 'error' || linearConnection.value.status === 'notConfigured' ? localizedText(linearConnection.value.detail, translate) : null);

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
    return connection.accountLabel ? `Signed in as ${connection.accountLabel}` : translate('surface.settingsIntegrationsPanel.signedIn');
  }
  if (connection.status === 'connecting') {
    return translate('surface.settingsIntegrationsPanel.waitingForAuthorization');
  }
  if (connection.status === 'notConfigured') {
    return translate('surface.settingsIntegrationsPanel.gitHubOAuthIsNotConfigured');
  }
  return translate('surface.settingsIntegrationsPanel.issuesAndPullRequests');
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
  if (clientIdChanged.value) {
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

.settings-integrations-panel__detail {
  margin: var(--space-8) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}
</style>
