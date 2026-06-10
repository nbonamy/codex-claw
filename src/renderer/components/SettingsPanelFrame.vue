<template>
  <section
    class="settings-panel"
    :aria-labelledby="titleId"
  >
    <header class="settings-panel__header">
      <h2 :id="titleId">{{ title }}</h2>
    </header>
    <div
      v-if="$slots.banner"
      class="settings-panel__banner"
    >
      <slot name="banner" />
    </div>
    <div class="settings-panel__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  titleId: string;
}>();
</script>

<style scoped>
.settings-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.settings-panel__header {
  min-height: var(--space-16);
  display: flex;
  align-items: flex-end;
  padding-bottom: var(--space-16);
}

.settings-panel__header h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-20);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-28);
}

.settings-panel__body {
  min-width: 0;
}

.settings-panel__banner {
  min-width: 0;
  margin-bottom: var(--space-8);
}
</style>
