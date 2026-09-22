<template>
  <section class="design-panel" :aria-label="translate('design.diagrams')">
    <div v-if="selectedDiagram" class="design-panel__canvas">
      <div class="design-panel__heading">
        <div>
          <h2>{{ selectedDiagram.title }}</h2>
          <span>{{ translate('design.revision', { kind: kindLabel(selectedDiagram), revision: selectedDiagram.revision }) }}</span>
        </div>
        <span class="design-panel__hint">{{ translate('design.editHint') }}</span>
      </div>
      <div v-if="remainingSuggestions.length" class="design-panel__remaining" :aria-label="translate('design.remainingSuggestions')">
        <span>{{ translate('design.alsoSuggested') }}</span>
        <button
          v-for="suggestion in remainingSuggestions"
          :key="suggestion.id"
          type="button"
          :disabled="busy"
          @click="emit('generate', suggestion.id)"
        >{{ suggestion.title }}</button>
      </div>
      <DesignDiagramView
        class="design-panel__diagram"
        :diagram="selectedDiagram"
        :image-source="imageSources[selectedDiagram.id]"
      />
    </div>

    <div v-else class="design-panel__suggestions">
      <div class="design-panel__intro">
        <span class="design-panel__eyebrow">{{ translate('design.mode') }}</span>
        <h2>{{ translate(design.suggestions.length ? 'design.chooseDiagram' : 'design.findingDiagrams') }}</h2>
        <p>{{ translate(design.suggestions.length ? 'design.suggestedFromConversation' : 'design.suggestionsWillAppear') }}</p>
      </div>
      <div v-if="design.suggestions.length" class="design-panel__suggestion-grid">
        <button
          v-for="suggestion in design.suggestions"
          :key="suggestion.id"
          type="button"
          class="design-panel__suggestion"
          :disabled="busy || Boolean(suggestion.diagramId)"
          @click="emit('generate', suggestion.id)"
        >
          <span>{{ suggestion.title }}</span>
          <p>{{ suggestion.description }}</p>
          <small>{{ translate(suggestion.diagramId ? 'design.generated' : 'design.generateDiagram') }}</small>
        </button>
      </div>
    </div>

    <div v-if="design.diagrams.length" class="design-panel__strip" :aria-label="translate('design.diagrams')">
      <button
        v-for="diagram in design.diagrams"
        :key="diagram.id"
        type="button"
        class="design-panel__thumbnail"
        :class="{ 'design-panel__thumbnail--selected': diagram.id === design.selectedDiagramId }"
        :aria-label="translate('design.showDiagram', { title: diagram.title })"
        :aria-pressed="diagram.id === design.selectedDiagramId"
        @click="emit('select', diagram.id)"
      >
        <DesignDiagramView compact :diagram="diagram" :image-source="imageSources[diagram.id]" />
        <span>{{ diagram.title }}</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { DesignDiagram, DesignDiagramAsset, DesignSession } from '@codex-claw/core/design';
import { translate } from '../i18n';
import DesignDiagramView from './DesignDiagramView.vue';

const props = withDefaults(defineProps<{
  busy?: boolean;
  design: DesignSession;
  readAsset: (diagramId: string) => Promise<DesignDiagramAsset>;
}>(), { busy: false });

const emit = defineEmits<{
  generate: [suggestionId: string];
  select: [diagramId: string];
}>();

const imageSources = reactive<Record<string, string>>({});
const imageRevisions = reactive<Record<string, number>>({});
const selectedDiagram = computed(() => props.design.diagrams.find(
  diagram => diagram.id === props.design.selectedDiagramId,
) ?? props.design.diagrams.at(-1) ?? null);
const remainingSuggestions = computed(() => props.design.suggestions.filter(suggestion => !suggestion.diagramId));

watch(
  () => props.design.diagrams.map(diagram => `${diagram.id}:${diagram.revision}:${diagram.content.kind}`).join('|'),
  () => {
    for (const diagram of props.design.diagrams) {
      if (diagram.content.kind !== 'image') {
        delete imageSources[diagram.id];
        delete imageRevisions[diagram.id];
        continue;
      }
      if (imageRevisions[diagram.id] === diagram.revision) continue;
      imageRevisions[diagram.id] = diagram.revision;
      void props.readAsset(diagram.id).then(asset => {
        imageSources[diagram.id] = asset.dataUrl;
      }).catch(() => {
        imageSources[diagram.id] = '';
      });
    }
  },
  { immediate: true },
);

function kindLabel(diagram: DesignDiagram): string {
  return diagram.content.kind === 'mermaid'
    ? translate('design.kind.mermaid')
    : diagram.content.kind === 'svg'
      ? translate('design.kind.svg')
      : translate('design.kind.image');
}
</script>

<style scoped>
.design-panel {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-shell-main);
}

.design-panel__canvas {
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  padding: var(--space-12);
  padding-bottom: 108px;
}

.design-panel__heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--space-8);
  margin-bottom: var(--space-8);
}

.design-panel__heading h2,
.design-panel__intro h2 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-16);
  line-height: var(--line-height-20);
}

.design-panel__heading span,
.design-panel__hint,
.design-panel__intro p {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.design-panel__hint {
  max-width: 220px;
  text-align: right;
}

.design-panel__diagram {
  min-height: 0;
  flex: 1 1 auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-surface-low);
}

.design-panel__remaining {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
  overflow-x: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.design-panel__remaining > span {
  flex: 0 0 auto;
}

.design-panel__remaining button {
  flex: 0 0 auto;
  padding: var(--space-3) var(--space-6);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text);
  background: var(--color-surface-low);
  font: inherit;
  cursor: pointer;
}

.design-panel__remaining button:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.design-panel__suggestions {
  flex: 1 1 auto;
  overflow: auto;
  padding: var(--space-16);
}

.design-panel__intro {
  max-width: 560px;
  margin: 8vh auto var(--space-12);
}

.design-panel__eyebrow {
  display: block;
  margin-bottom: var(--space-4);
  color: var(--color-primary);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.design-panel__intro p {
  margin: var(--space-4) 0 0;
}

.design-panel__suggestion-grid {
  width: min(100%, 720px);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-8);
  margin: 0 auto;
}

.design-panel__suggestion {
  min-height: 140px;
  display: flex;
  flex-direction: column;
  align-items: start;
  padding: var(--space-10);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  color: var(--color-text);
  background: var(--color-surface-low);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.design-panel__suggestion:hover:not(:disabled),
.design-panel__suggestion:focus-visible {
  border-color: var(--color-primary);
  background: var(--color-surface-high);
}

.design-panel__suggestion:disabled {
  cursor: default;
  opacity: 0.65;
}

.design-panel__suggestion > span {
  font-weight: var(--font-weight-semibold);
}

.design-panel__suggestion p {
  flex: 1 1 auto;
  margin: var(--space-4) 0 var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
}

.design-panel__suggestion small {
  color: var(--color-primary);
}

.design-panel__strip {
  position: absolute;
  left: var(--space-12);
  bottom: var(--space-12);
  max-width: calc(100% - 2 * var(--space-12));
  display: flex;
  gap: var(--space-6);
  padding: var(--space-4);
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-shell-main);
  box-shadow: var(--shadow-md);
}

.design-panel__thumbnail {
  width: 104px;
  height: 76px;
  flex: 0 0 auto;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: var(--space-2);
  padding: var(--space-3);
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  background: var(--color-surface-low);
  cursor: pointer;
}

.design-panel__thumbnail--selected {
  border-color: var(--color-primary);
  color: var(--color-text);
}

.design-panel__thumbnail span {
  overflow: hidden;
  font-size: var(--font-size-11);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
