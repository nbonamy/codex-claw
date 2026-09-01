<template>
  <OnboardingLandingFrame
    class="github-onboarding"
    :label="$t('surface.githubOnboardingLanding.connectGitHub')"
  >
    <div class="github-onboarding__content">
      <GitHubIcon
        class="github-onboarding__mark"
        size="64"
        aria-hidden="true"
      />

      <template v-if="connection.status === 'connected'">
        <h1 class="github-onboarding__title">
          <span>{{ t('auth.githubConnectedTitle') }}</span>
          <span class="github-onboarding__title-detail">{{ t('auth.githubConnectedDetail') }}</span>
        </h1>
        <div class="github-onboarding__actions">
          <el-button
            type="primary"
            size="large"
            @click="emit('continue')"
          >{{ t('auth.githubContinue') }}</el-button>
        </div>
        <p v-if="connection.accountLabel" class="github-onboarding__account">
          {{ t('auth.githubConnectedAs', { account: connection.accountLabel }) }}
        </p>
      </template>

      <template v-else-if="authorization">
        <h1 class="github-onboarding__title">{{ t('auth.githubAuthorizationTitle') }}</h1>
        <p class="github-onboarding__description">{{ t('auth.githubAuthorizationDescription') }}</p>
        <GitHubAuthorizationSteps
          class="github-onboarding__steps"
          :authorization="authorization"
          @open="emit('openAuthorization')"
        />
        <div class="github-onboarding__actions">
          <el-button
            size="large"
            @click="emit('skip')"
          >{{ t('auth.githubSkip') }}</el-button>
        </div>
      </template>

      <template v-else>
        <h1 class="github-onboarding__title">
          <span>{{ t('auth.githubTitle') }}</span>
          <span class="github-onboarding__title-detail">{{ t('auth.githubTitleDetail') }}</span>
        </h1>
        <div class="github-onboarding__actions">
          <el-button
            type="primary"
            size="large"
            :loading="busy"
            @click="emit('connect')"
          >{{ busy ? t('auth.githubConnecting') : t('auth.githubConnect') }}</el-button>
          <el-button
            size="large"
            @click="emit('skip')"
          >{{ t('auth.githubSkip') }}</el-button>
        </div>
      </template>
      <p v-if="error" class="github-onboarding__error" role="alert">{{ error }}</p>
    </div>
  </OnboardingLandingFrame>
</template>

<script setup lang="ts">
import type { WorkIntegrationConnection, WorkProviderAuthorization } from '@codex-claw/core/contracts';
import { useI18n } from 'vue-i18n';
import { GitHubIcon } from '../shared/icons/app-icons';
import GitHubAuthorizationSteps from './GitHubAuthorizationSteps.vue';
import OnboardingLandingFrame from './OnboardingLandingFrame.vue';

withDefaults(defineProps<{
  connection: WorkIntegrationConnection;
  authorization?: WorkProviderAuthorization | null;
  busy?: boolean;
  error?: string | null;
}>(), {
  authorization: null,
  busy: false,
  error: null,
});

const emit = defineEmits<{
  connect: [];
  continue: [];
  openAuthorization: [];
  skip: [];
}>();
const { t } = useI18n();
</script>

<style scoped>
.github-onboarding__content {
  width: min(720px, 100%);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.github-onboarding__mark {
  color: var(--color-text);
}

.github-onboarding__title {
  max-width: 720px;
  margin: var(--space-12) 0 0;
  font-size: clamp(48px, 5vw, 72px);
  font-weight: var(--font-weight-bold);
  letter-spacing: -0.045em;
  line-height: 0.98;
}

.github-onboarding__title span {
  display: block;
}

.github-onboarding__title-detail {
  color: var(--color-text-muted);
}

.github-onboarding__description {
  max-width: 620px;
  margin: var(--space-8) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-18);
  line-height: var(--line-height-24);
}

.github-onboarding__actions {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  margin-top: var(--space-24);
  -webkit-app-region: no-drag;
}

.github-onboarding__steps {
  width: min(620px, 100%);
  margin-top: var(--space-16);
  -webkit-app-region: no-drag;
}

.github-onboarding__account {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.github-onboarding__error {
  margin: var(--space-6) 0 0;
  color: var(--color-error);
}
</style>
