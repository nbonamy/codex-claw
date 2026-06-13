<template>
  <component
    :is="href ? 'a' : 'button'"
    class="chat-icon-button"
    :class="{
      'chat-icon-button--bordered': bordered,
      'chat-icon-button--danger': danger,
    }"
    :download="download ? '' : undefined"
    :href="href"
    :rel="rel"
    :target="target"
    :type="href ? undefined : 'button'"
    :aria-label="label"
    :title="title || label"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
defineProps<{
  bordered?: boolean
  danger?: boolean
  download?: boolean
  href?: string
  label: string
  rel?: string
  target?: string
  title?: string
}>()
</script>

<style scoped>
.chat-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--space-12);
  height: var(--space-12);
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-lg);
  appearance: none;
  background: transparent;
  color: var(--color-outline);
  cursor: pointer;
  font: inherit;
  line-height: 1;
  text-decoration: none;
}

.chat-icon-button--bordered {
  border: 1px solid var(--color-border);
  background: var(--color-surface-lowest);
}

.chat-icon-button:hover,
.chat-icon-button:focus-visible {
  background-color: var(--color-surface-low);
  color: var(--color-text);
}

.chat-icon-button--danger:hover,
.chat-icon-button--danger:focus-visible {
  color: var(--color-error);
}

.chat-icon-button :deep(svg) {
  width: var(--icon-sm);
  height: var(--icon-sm);
}
</style>
