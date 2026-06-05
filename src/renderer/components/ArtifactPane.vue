<template>
  <aside
    class="artifact-pane"
    aria-label="Artifacts"
  >
    <header>
      <span>Artifacts</span>
    </header>
    <div class="artifact-pane__empty">
      Diff, plans, files, and command detail will land here.
    </div>
  </aside>
</template>

<style scoped>
.artifact-pane {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: 48px minmax(0, 1fr);
  background: var(--cc-artifact-bg);
  border-left: 1px solid var(--cc-border-muted);
}

.artifact-pane header {
  display: flex;
  align-items: center;
  padding: 0 var(--cc-space-4);
  color: var(--cc-text-muted);
  font: var(--cc-font-caption);
  border-bottom: 1px solid var(--cc-border-muted);
}

.artifact-pane__empty {
  display: grid;
  place-items: center;
  padding: var(--cc-space-5);
  color: var(--cc-text-muted);
  text-align: center;
}

@media (max-width: 1100px) {
  .artifact-pane {
    display: none;
  }
}
</style>
