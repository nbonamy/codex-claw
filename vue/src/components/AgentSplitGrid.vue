<template>
  <div class="agent-split-grid" :data-layout="layout">
    <section
      v-for="(pane, index) in panes"
      :key="pane.id"
      class="agent-split-grid__pane"
      :class="{ 'agent-split-grid__pane--focused': focusedPaneId === pane.id }"
      :data-pane-id="pane.id"
      :data-agent-id="pane.agentId ?? undefined"
      @pointerdown.capture="focusPane(pane.id, $event)"
      @focusin.capture="focusPane(pane.id, $event)"
    >
      <slot name="header" :agent-id="pane.agentId" :top-left="index === 0"
        :top-right="index === (layout === '2-horizontal' || layout === 'single' ? 0 : 1)" />
      <slot
        v-if="pane.agentId"
        :agent-id="pane.agentId"
        :focused="focusedPaneId === pane.id"
      />
      <button
        v-else
        class="agent-split-grid__empty"
        type="button"
        @click="emit('focus', pane.id)"
      >
        {{ t('split.selectAgent') }}
      </button>
    </section>
  </div>
</template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { SplitLayout, SplitPane } from './use-split-workspace';
defineProps<{
  layout: SplitLayout;
  panes: SplitPane[];
  focusedPaneId: number;
}>();
const emit = defineEmits<{ focus: [paneId: number] }>();
const { t } = useI18n();
function focusPane(id: number, event: Event): void {
  // The fixed top-right toggle belongs to the focused agent, not its host pane.
  if (event.target instanceof Element && event.target.closest('[data-global-workspace-toggle]')) return;
  emit('focus', id);
}
</script>
<style scoped>
.agent-split-grid {
  display: grid;
  flex: 1;
  min-width: 0;
  min-height: 0;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
}
.agent-split-grid[data-layout='2-vertical'] {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.agent-split-grid[data-layout='2-horizontal'] {
  grid-template-rows: repeat(2, minmax(0, 1fr));
}
.agent-split-grid[data-layout='4-quadrant'] {
  grid-template: repeat(2, minmax(0, 1fr)) / repeat(2, minmax(0, 1fr));
}
.agent-split-grid__pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.agent-split-grid[data-layout='2-vertical'] .agent-split-grid__pane + .agent-split-grid__pane,
.agent-split-grid[data-layout='4-quadrant'] .agent-split-grid__pane:nth-child(even) {
  border-left: 1px solid var(--color-border);
}
.agent-split-grid[data-layout='2-horizontal'] .agent-split-grid__pane + .agent-split-grid__pane,
.agent-split-grid[data-layout='4-quadrant'] .agent-split-grid__pane:nth-child(n + 3) {
  border-top: 1px solid var(--color-border);
}
.agent-split-grid__pane > :deep(.conversation-pane) {
  position: relative;
  isolation: isolate;
  min-width: 0;
}
.agent-split-grid:not([data-layout='single']) .agent-split-grid__pane:not(.agent-split-grid__pane--focused) > :deep(.conversation-pane)::after {
  position: absolute;
  z-index: 10;
  inset: 0;
  background: var(--color-surface-lowest);
  opacity: 0.35;
  pointer-events: none;
  content: '';
}
.agent-split-grid__empty {
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}
</style>
