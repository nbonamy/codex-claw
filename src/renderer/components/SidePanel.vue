<template>
  <aside
    class="side-panel"
    aria-label="Side panel"
  >
    <header class="side-panel__header">
      <div class="side-panel__title-group">
        <FileTextIcon
          v-if="panel.kind === 'markdown'"
          class="side-panel__icon"
          aria-hidden="true"
        />
        <div class="side-panel__copy">
          <h2>{{ panel.title }}</h2>
          <p v-if="panel.subtitle">{{ panel.subtitle }}</p>
        </div>
      </div>
      <button
        class="side-panel__close"
        type="button"
        aria-label="Close side panel"
        @click="emit('close')"
      >
        <X aria-hidden="true" />
      </button>
    </header>

    <MarkdownPanel
      v-if="panel.kind === 'markdown'"
      :content="panel.content"
      :error="panel.error"
      :state="panel.state"
    />
  </aside>
</template>

<script setup lang="ts">
import MarkdownPanel from './MarkdownPanel.vue';
import { FileTextIcon, X } from '../shared/icons/app-icons';
import type { SidePanelState } from './side-panel';

defineProps<{
  panel: SidePanelState;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<style scoped>
.side-panel {
  flex: 0 0 min(38vw, 520px);
  width: min(38vw, 520px);
  min-width: 320px;
  max-width: 560px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: var(--color-surface-lowest);
}

.side-panel__header {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  padding: var(--space-6) var(--space-8);
  border-bottom: 1px solid var(--color-border);
}

.side-panel__title-group {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
}

.side-panel__icon {
  flex: 0 0 auto;
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.side-panel__copy {
  min-width: 0;
  display: grid;
  gap: var(--space-1);
}

.side-panel__copy h2,
.side-panel__copy p {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-panel__copy h2 {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.side-panel__copy p {
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
}

.side-panel__close {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--space-12);
  height: var(--space-12);
  padding: 0;
  border: 0;
  border-radius: var(--radius-full);
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.side-panel__close:hover {
  color: var(--color-text);
  background: var(--color-surface-low);
}

.side-panel__close svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

@media (width < 1000px) {
  .side-panel {
    flex-basis: 360px;
    width: 360px;
  }
}
</style>
