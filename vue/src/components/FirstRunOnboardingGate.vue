<template>
  <CodexLoginLanding
    :provider-setup="providerSetup"
    :updating-provider="updatingProvider"
    :setup-error="setupError"
    @customize="emit('customize', $event)"
    v-if="showLoginLanding"
    :variant="initialAuthenticationLoading ? 'connecting' : 'sign-in'"
    :loading="authenticationLoading || authentication?.login.status === 'pending'"
    :cancellable="authentication?.login.status === 'pending'"
    :cancelling="authenticationCancelling"
    :error="authenticationError ?? authentication?.login.error"
    :codex-connected="codexConnected"
    :claude-connected="claudeConnected"
    :codex-enabled="snapshot.providerConnections?.find(engine => engine.backend === 'codex')?.enabled !== false"
    :claude-enabled="snapshot.providerConnections?.find(engine => engine.backend === 'claude')?.enabled !== false"
    :claude-loading="claudeLoading"
    :claude-error="claudeError"
    :continuing="continuing"
    @connect-claude="emit('connect-claude')"
    @continue="emit('continue')"
    @cancel="cancelChatGptLogin"
    @login="startChatGptLogin"
  />
  <GitHubOnboardingLanding
    v-else-if="githubOnboardingVisible"
    :authorization="workProviderAuthorization"
    :busy="repositoryAcquireBusy"
    :error="repositoryAcquireError ?? workBacklogError"
    @connect="connectGitHub"
    @open-authorization="openGitHubAuthorization"
    @skip="completeGitHubOnboardingStep"
  />
  <OnboardingCompleteLanding
    v-else-if="onboardingCompleteVisible"
    :celebrate="snapshot.general.celebrationsEnabled !== false"
    @complete="finishFirstRunOnboarding"
  />
  <LocalClaudeAuthenticationDialog
    :model-value="claudeDialogVisible"
    :config-directory="claudeAuthentication?.configDirectory !== undefined ? claudeAuthentication.configDirectory : providerSetup?.find(setup => setup.backend === 'claude')?.homePath"
    :loading="claudeLoading"
    :error="claudeError"
    @update:model-value="emit('update:claudeDialogVisible', $event)"
    @refresh="emit('refresh-claude')"
  />
  <ProviderSetupDialog :setup="customizedSetup ?? null" :allow-reset="allowSetupReset" :busy="setupBusy ?? false" :error="setupError ?? null" @close="emit('close-setup')" @save="emit('save-setup', $event)" />
</template>

<script setup lang="ts">
import type { AgentBackend, AppSnapshot, ClaudeAuthentication, CodexAuthentication, WorkProviderAuthorization } from '@workspace/core/contracts';
import type { ProviderSetupChange, ProviderSetupStatus } from '@workspace/core/contracts/provider-setup';
import ProviderSetupDialog from './ProviderSetupDialog.vue';
import { toRefs } from 'vue';
import CodexLoginLanding from './CodexLoginLanding.vue';
import GitHubOnboardingLanding from './GitHubOnboardingLanding.vue';
import OnboardingCompleteLanding from './OnboardingCompleteLanding.vue';
import LocalClaudeAuthenticationDialog from './LocalClaudeAuthenticationDialog.vue';

const props = defineProps<{
  providerSetup?: ProviderSetupStatus[];
  allowSetupReset?: boolean;
  customizedSetup?: ProviderSetupStatus | null;
  setupBusy?: boolean;
  updatingProvider?: AgentBackend | null;
  setupError?: string | null;
  authentication: CodexAuthentication | null;
  claudeAuthentication?: ClaudeAuthentication | null;
  claudeDialogVisible: boolean;
  codexConnected: boolean;
  claudeConnected: boolean;
  claudeLoading: boolean;
  claudeError: string | null;
  continuing: boolean;
  authenticationCancelling: boolean;
  authenticationError: string | null;
  authenticationLoading: boolean;
  githubOnboardingVisible: boolean;
  initialAuthenticationLoading: boolean;
  onboardingCompleteVisible: boolean;
  repositoryAcquireBusy: boolean;
  repositoryAcquireError: string | null;
  showLoginLanding: boolean;
  snapshot: AppSnapshot;
  workBacklogError: string | null;
  workProviderAuthorization: WorkProviderAuthorization | null;
}>();

const emit = defineEmits<{
  customize: [backend: AgentBackend];
  'close-setup': [];
  'save-setup': [choice: ProviderSetupChange];
  cancel: [];
  complete: [];
  'connect-github': [];
  'connect-claude': [];
  'refresh-claude': [];
  'update:claudeDialogVisible': [value: boolean];
  continue: [];
  finish: [];
  login: [];
  'open-github-authorization': [];
}>();

const {
  authentication,
  authenticationCancelling,
  authenticationError,
  authenticationLoading,
  githubOnboardingVisible,
  initialAuthenticationLoading,
  onboardingCompleteVisible,
  repositoryAcquireBusy,
  repositoryAcquireError,
  showLoginLanding,
  snapshot,
  workBacklogError,
  workProviderAuthorization,
} = toRefs(props);

function cancelChatGptLogin(): void {
  emit('cancel');
}

function completeGitHubOnboardingStep(): void {
  emit('complete');
}

function connectGitHub(): void {
  emit('connect-github');
}

function finishFirstRunOnboarding(): void {
  emit('finish');
}

function openGitHubAuthorization(): void {
  emit('open-github-authorization');
}

function startChatGptLogin(): void {
  emit('login');
}
</script>
