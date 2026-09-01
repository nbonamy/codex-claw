<template>
  <section
    class="onboarding-landing-frame"
    :class="`onboarding-landing-frame--${layout}`"
    :aria-label="label"
  >
    <slot />
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  layout?: 'centered' | 'editorial';
}>(), {
  layout: 'editorial',
});
</script>

<style scoped>
.onboarding-landing-frame {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  background: var(--color-shell-main);
  color: var(--color-text);
  -webkit-app-region: drag;
}

.onboarding-landing-frame--editorial {
  justify-content: flex-start;
  padding: var(--space-32) clamp(48px, 13vw, 208px);
}

.onboarding-landing-frame--centered {
  justify-content: center;
  padding: var(--space-20);
}
</style>
