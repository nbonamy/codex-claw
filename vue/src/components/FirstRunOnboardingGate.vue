<template>
  <CodexLoginLanding
    v-if="showLoginLanding"
    :variant="initialAuthenticationLoading ? 'connecting' : 'sign-in'"
    :loading="authenticationLoading || authentication?.login.status === 'pending'"
    :cancellable="authentication?.login.status === 'pending'"
    :cancelling="authenticationCancelling"
    :error="authenticationError ?? authentication?.login.error"
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
</template>

<script setup lang="ts">
import type { AppSnapshot, CodexAuthentication, WorkProviderAuthorization } from '@codex-claw/core/contracts';
import { toRefs } from 'vue';
import CodexLoginLanding from './CodexLoginLanding.vue';
import GitHubOnboardingLanding from './GitHubOnboardingLanding.vue';
import OnboardingCompleteLanding from './OnboardingCompleteLanding.vue';

const props = defineProps<{
  authentication: CodexAuthentication | null;
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
  cancel: [];
  complete: [];
  'connect-github': [];
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
