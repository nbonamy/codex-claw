<template>
  <article
    class="markdown-panel"
    :aria-busy="state === 'loading'"
  >
    <div
      v-if="state === 'loading'"
      class="markdown-panel__empty text-shimmer"
    >
      Loading markdown...
    </div>
    <div
      v-else-if="state === 'error'"
      class="markdown-panel__empty markdown-panel__empty--error"
    >
      {{ error ?? 'Unable to load markdown.' }}
    </div>
    <div
      v-else-if="content.trim()"
      class="markdown-panel__content claw-markdown"
      v-html="renderMarkdown(content)"
    />
    <div
      v-else
      class="markdown-panel__empty"
    >
      No markdown content.
    </div>
  </article>
</template>

<script setup lang="ts">
import { renderMarkdown } from '../shared/chat/message-markdown';

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
  height: 100%;
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
