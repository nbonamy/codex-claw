<template>
  <section
    class="settings-general-panel"
    aria-labelledby="settings-general-title"
  >
    <h3 id="settings-general-title">General</h3>
    <p class="settings-general-panel__empty">No general settings yet.</p>
  </section>
</template>

<style scoped>
.settings-general-panel {
  min-width: 0;
  padding: var(--space-8) var(--space-12);
  background: var(--color-surface-lowest);
}

.settings-general-panel h3 {
  margin: 0 0 var(--space-8);
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-24);
}

.settings-general-panel__empty {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}
</style>
