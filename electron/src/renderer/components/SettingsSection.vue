<template>
  <section
    class="settings-section"
    :aria-labelledby="title ? titleId : undefined"
  >
    <header
      v-if="title"
      class="settings-section__header"
    >
      <h3 :id="titleId">{{ title }}</h3>
    </header>
    <div class="settings-section__group">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  titleId?: string;
}>();
</script>

<style scoped>
.settings-section {
  min-width: 0;
}

.settings-section + .settings-section {
  margin-top: var(--space-24);
}

.settings-section__header {
  padding: 0 var(--space-2) var(--space-8);
}

.settings-section__header h3 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.settings-section__group {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-lowest);
}

.settings-section__group :deep(.settings-row + .settings-row) {
  border-top: 1px solid var(--color-border);
}
</style>
