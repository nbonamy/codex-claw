<template>
  <section
    class="image-preview-panel"
    :aria-label="panel.title"
  >
    <div class="image-preview-panel__viewport">
      <img
        :src="panel.src"
        :alt="panel.alt"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import type { SidePanelImageState } from './side-panel';

defineProps<{
  panel: SidePanelImageState;
}>();
</script>

<style scoped>
.image-preview-panel {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  background: var(--color-surface-low);
}

.image-preview-panel__viewport {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: var(--space-8);
}

.image-preview-panel__viewport img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
