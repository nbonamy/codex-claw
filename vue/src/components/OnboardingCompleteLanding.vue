<template>
  <OnboardingLandingFrame
    class="onboarding-complete"
    :label="$t('surface.onboardingCompleteLanding.codexClawIsReady')"
  >
    <div class="onboarding-complete__content">
      <img
        class="onboarding-complete__mark"
        :src="appIconUrl"
        alt=""
      >
      <h1 class="onboarding-landing-title onboarding-complete__title">
        <span class="onboarding-landing-title__line">{{ t('auth.completeTitle') }}</span>
        <span class="onboarding-landing-title__line onboarding-landing-title__detail">{{ t('auth.completeDetail') }}</span>
      </h1>
      <el-button
        class="onboarding-complete__action"
        type="primary"
        size="large"
        @click="complete"
      >{{ t('auth.completeAction') }}</el-button>
    </div>
  </OnboardingLandingFrame>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConfetti } from '../shared/confetti/use-confetti';
import OnboardingLandingFrame from './OnboardingLandingFrame.vue';

const appIconUrl = new URL('../../assets/icon.png', import.meta.url).href;

const props = withDefaults(defineProps<{
  celebrate?: boolean;
  durationMs?: number;
}>(), {
  celebrate: true,
  durationMs: 5000,
});

const emit = defineEmits<{
  complete: [];
}>();
const { t } = useI18n();
let completionTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  if (props.celebrate) useConfetti().celebrate();
  completionTimer = globalThis.setTimeout(complete, props.durationMs);
});

onBeforeUnmount(clearCompletionTimer);

function complete(): void {
  clearCompletionTimer();
  emit('complete');
}

function clearCompletionTimer(): void {
  if (completionTimer !== null) globalThis.clearTimeout(completionTimer);
  completionTimer = null;
}
</script>

<style scoped>
.onboarding-complete__content {
  width: min(720px, 100%);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}

.onboarding-complete__mark {
  width: 72px;
  height: 72px;
}

.onboarding-complete__title {
  max-width: 720px;
}

.onboarding-complete__action {
  margin-top: var(--space-24);
  -webkit-app-region: no-drag;
}
</style>
