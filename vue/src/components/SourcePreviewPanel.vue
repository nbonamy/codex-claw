<template>
  <article
    class="source-preview-panel"
    :class="{
      'source-preview-panel--hide-line-numbers': !showLineNumbers,
      'source-preview-panel--wrap': wordWrap,
    }"
    :aria-busy="state === 'loading'"
  >
    <div
      v-if="state === 'loading'"
      class="source-preview-panel__empty codex-text-shimmer"
    >
      Loading source...
    </div>
    <div
      v-else-if="state === 'error'"
      class="source-preview-panel__empty source-preview-panel__empty--error"
    >
      {{ error ?? 'Unable to load source.' }}
    </div>
    <div
      v-else-if="content.trim()"
      class="source-preview-panel__content codex-markdown"
      v-html="renderCodeBlock(content, language ?? undefined)"
    />
    <div
      v-else
      class="source-preview-panel__empty"
    >
      No source content.
    </div>
  </article>
</template>

<script setup lang="ts">
import { renderCodeBlock } from '@codex-app-sdk/vue';

withDefaults(defineProps<{
  content: string;
  error?: string | null;
  language?: string | null;
  showLineNumbers?: boolean;
  state?: 'idle' | 'loading' | 'error';
  wordWrap?: boolean;
}>(), {
  error: null,
  language: null,
  showLineNumbers: true,
  state: 'idle',
  wordWrap: false,
});
</script>

<style scoped>
.source-preview-panel {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow-x: auto;
  overflow-y: auto;
  padding: 0;
  background: var(--color-surface-lowest);
  scrollbar-width: thin;
}

.source-preview-panel__content {
  min-width: max-content;
}

.source-preview-panel--wrap .source-preview-panel__content {
  min-width: 0;
}

.source-preview-panel__content :deep(.shiki),
.source-preview-panel__content :deep(pre) {
  --source-preview-line-height: 20px;
  --source-preview-font-size: var(--code-font-size, var(--font-size-13));
  --source-preview-gutter-width: 5.5ch;
  --source-preview-code-gap: 2ch;
  min-width: max-content;
  margin: 0;
  padding: var(--space-8) 0;
  background: transparent !important;
  font-family: var(--font-family-mono);
  font-size: var(--source-preview-font-size);
  line-height: 0;
}

.source-preview-panel__content :deep(code) {
  display: block;
  counter-reset: source-line;
  line-height: 0;
}

.source-preview-panel__content :deep(.line) {
  position: relative;
  display: block;
  min-height: var(--source-preview-line-height);
  padding-left: calc(var(--source-preview-gutter-width) + var(--source-preview-code-gap));
  padding-right: var(--space-8);
  line-height: var(--source-preview-line-height);
  white-space: pre;
}

.source-preview-panel--wrap .source-preview-panel__content :deep(.shiki),
.source-preview-panel--wrap .source-preview-panel__content :deep(pre) {
  min-width: 0;
}

.source-preview-panel--wrap .source-preview-panel__content :deep(.line) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.source-preview-panel--hide-line-numbers .source-preview-panel__content :deep(.line) {
  padding-left: var(--space-8);
}

.source-preview-panel--hide-line-numbers .source-preview-panel__content :deep(.line::before) {
  content: none;
}

.source-preview-panel__content :deep(.line::before) {
  content: counter(source-line);
  counter-increment: source-line;
  position: absolute;
  top: 0;
  left: 0;
  width: var(--source-preview-gutter-width);
  padding-right: 1ch;
  border-right: 1px solid var(--color-border);
  color: var(--color-border);
  line-height: var(--source-preview-line-height);
  text-align: right;
  user-select: none;
}

.source-preview-panel__empty {
  padding: var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.source-preview-panel__empty--error {
  color: var(--color-error);
}
</style>
