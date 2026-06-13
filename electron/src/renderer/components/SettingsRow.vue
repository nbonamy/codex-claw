<template>
  <component
    :is="as"
    class="settings-row"
  >
    <span class="settings-row__copy">
      <strong>{{ title }}</strong>
      <span v-if="description">{{ description }}</span>
      <span
        v-if="error"
        class="settings-row__error"
      >
        {{ error }}
      </span>
      <slot name="copy" />
    </span>
    <span
      v-if="$slots.control"
      class="settings-row__control"
    >
      <slot name="control" />
    </span>
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  as?: 'article' | 'div' | 'label';
  description?: string;
  error?: string | null;
  title: string;
}>(), {
  as: 'article',
  description: '',
  error: null,
});
</script>

<style scoped>
.settings-row {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, auto);
  align-items: center;
  gap: var(--space-16);
  padding: var(--space-10) var(--space-12);
}

.settings-row__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.settings-row__copy strong {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-22);
}

.settings-row__copy span {
  color: var(--color-text-muted);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
}

.settings-row__copy .settings-row__error {
  color: var(--color-danger, #c2410c);
}

.settings-row__control {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-self: end;
  justify-content: flex-end;
  gap: var(--space-8);
}

@media (max-width: 780px) {
  .settings-row {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
  }

  .settings-row__control {
    justify-self: start;
  }
}
</style>
