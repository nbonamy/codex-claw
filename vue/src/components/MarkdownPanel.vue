<template>
  <article
    class="markdown-panel"
    :aria-busy="state === 'loading'"
  >
    <div
      v-if="state === 'loading'"
      class="markdown-panel__empty codex-text-shimmer"
    > {{ $t('surface.markdownPanel.loadingMarkdown') }} </div>
    <div
      v-else-if="state === 'error'"
      class="markdown-panel__empty markdown-panel__empty--error"
    >
      {{ error ?? $t('surface.markdownPanel.unableToLoadMarkdown') }}
    </div>
    <div
      v-else-if="content.trim()"
      class="markdown-panel__content codex-markdown"
      v-html="renderMarkdown(content)"
    />
    <div
      v-else
      class="markdown-panel__empty"
    > {{ $t('surface.markdownPanel.noMarkdownContent') }} </div>
  </article>
</template>

<script setup lang="ts">
import { renderMarkdown } from '@codex-app-sdk/vue';

withDefaults(defineProps<{
  content: string;
  error?: string | null;
  state?: 'idle' | 'loading' | 'error';
}>(), {
  error: null,
  state: 'idle',
});
</script>

<style scoped>
.markdown-panel {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: var(--space-8);
  scrollbar-width: thin;
}

.markdown-panel__empty {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.markdown-panel__empty--error {
  color: var(--color-error);
}
</style>
