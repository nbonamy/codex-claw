<template>
  <OnboardingLandingFrame
    class="codex-login"
    :class="`codex-login--${variant}`"
    :layout="variant === 'connecting' ? 'centered' : 'editorial'"
    :label="t(variant === 'connecting'
      ? 'surface.codexLoginLanding.connectingToCodexClaw'
      : 'surface.codexLoginLanding.signInToCodexClaw')"
  >
    <div
      class="codex-login__content"
      :class="`codex-login__content--${variant}`"
    >
      <div class="codex-login__mark">
        <img
          :src="appIconUrl"
          :alt="$t('surface.codexLoginLanding.codexClaw')"
        >
      </div>
      <template v-if="variant === 'connecting'">
        <h1 class="codex-login__connecting-title">{{ t('auth.connectingTitle') }}</h1>
        <div
          class="codex-login__progress"
          role="progressbar"
          :aria-label="t('auth.connectingStatus')"
        >
          <span class="codex-login__progress-segment" />
        </div>
        <div class="codex-login__status" role="status" aria-live="polite">
          <span class="codex-login__status-dot" aria-hidden="true" />
          <span>{{ t('auth.connectingStatus') }}</span>
        </div>
      </template>
      <template v-else>
        <h1 class="codex-login__sign-in-title">
          <span class="codex-login__title-product">{{ t('auth.signInTitleProduct') }}</span>
          <span class="codex-login__title-detail">
            {{ t('auth.signInTitleDetailFirst') }}<br>
            {{ t('auth.signInTitleDetailSecond') }}
          </span>
        </h1>
        <el-button
          type="primary"
          size="large"
          :loading="loading"
          @click="emit('login')"
        >
          {{ loading ? t('auth.waiting') : t('auth.continue') }}
        </el-button>
        <button
          v-if="cancellable"
          class="codex-login__cancel"
          type="button"
          :disabled="cancelling"
          @click="emit('cancel')"
        >
          {{ t('auth.cancel') }}
        </button>
        <p v-else class="codex-login__description">{{ t('auth.signInDescription') }}</p>
        <p v-if="error" class="codex-login__error" role="alert">{{ error }}</p>
      </template>
    </div>
  </OnboardingLandingFrame>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import OnboardingLandingFrame from './OnboardingLandingFrame.vue';

const appIconUrl = new URL('../../assets/icon.png', import.meta.url).href;

withDefaults(defineProps<{
  variant?: 'connecting' | 'sign-in';
  loading?: boolean;
  cancellable?: boolean;
  cancelling?: boolean;
  error?: string | null;
}>(), {
  variant: 'sign-in',
});

const emit = defineEmits<{ cancel: []; login: [] }>();
const { t } = useI18n();
</script>

<style scoped>
.codex-login__content {
  display: flex;
  flex-direction: column;
}

.codex-login__content--sign-in {
  width: min(700px, 100%);
  align-items: flex-start;
  text-align: left;
}

.codex-login__content--connecting {
  width: min(760px, 100%);
  align-items: center;
  text-align: center;
  transform: translateY(calc(-1 * var(--space-12)));
}

.codex-login__mark {
  width: 104px;
  height: 104px;
  overflow: hidden;
}

.codex-login__content--connecting .codex-login__mark {
  width: 128px;
  height: 128px;
}

.codex-login__mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.codex-login__sign-in-title {
  max-width: 700px;
  margin: var(--space-12) 0 0;
  color: var(--color-text-muted);
  font-size: clamp(52px, 5.4vw, 80px);
  font-weight: var(--font-weight-bold);
  letter-spacing: -0.045em;
  line-height: 0.98;
}

.codex-login__sign-in-title span {
  display: block;
}

.codex-login__title-product {
  color: var(--color-text);
}

.codex-login__connecting-title {
  margin: var(--space-16) 0 0;
  font-size: clamp(36px, 4vw, 56px);
  font-weight: var(--font-weight-bold);
  letter-spacing: -0.035em;
  line-height: 1.05;
}

.codex-login .el-button {
  margin-top: var(--space-24);
  -webkit-app-region: no-drag;
}

.codex-login__description {
  margin: var(--space-6) 0 0;
  color: var(--color-text-muted);
  line-height: var(--line-height-20);
}

.codex-login__progress {
  position: relative;
  width: min(280px, 70%);
  height: 4px;
  margin-top: var(--space-24);
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-border);
}

.codex-login__progress-segment {
  position: absolute;
  inset-block: 0;
  width: 72px;
  border-radius: inherit;
  background: var(--color-primary);
  animation: codex-login-progress 1.4s ease-in-out infinite;
}

.codex-login__status {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-12);
  color: var(--color-text-muted);
  line-height: var(--line-height-20);
}

.codex-login__status-dot {
  width: var(--space-4);
  height: var(--space-4);
  border-radius: var(--radius-full);
  background: var(--color-primary);
  animation: codex-login-status-pulse 1.4s ease-in-out infinite;
}

.codex-login__cancel {
  margin-top: var(--space-6);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: var(--font-size-15);
  line-height: var(--line-height-20);
  -webkit-app-region: no-drag;
}

.codex-login__cancel:hover:not(:disabled) {
  color: var(--color-text);
}

.codex-login__cancel:disabled {
  cursor: default;
  opacity: 0.5;
}

.codex-login__error {
  margin-top: var(--space-6) !important;
  color: var(--color-error) !important;
}

@keyframes codex-login-progress {
  from {
    transform: translateX(-72px);
  }

  to {
    transform: translateX(280px);
  }
}

@keyframes codex-login-status-pulse {
  0%,
  100% {
    opacity: 0.45;
  }

  50% {
    opacity: 1;
  }
}

@media (max-width: 720px) {
  .codex-login--sign-in {
    padding-inline: var(--space-24);
  }
}

@media (prefers-reduced-motion: reduce) {
  .codex-login__progress-segment {
    left: calc(50% - 36px);
    animation: none;
  }

  .codex-login__status-dot {
    animation: none;
  }
}
</style>
