<template>
  <article
    class="git-diff-preview-panel"
    :class="{ 'git-diff-preview-panel--wrap': wordWrap }"
    :aria-busy="state === 'loading'"
  >
    <div
      v-if="state === 'loading'"
      class="git-diff-preview-panel__empty text-shimmer"
    >
      Loading diff...
    </div>
    <div
      v-else-if="state === 'error'"
      class="git-diff-preview-panel__empty git-diff-preview-panel__empty--error"
    >
      {{ error ?? 'Unable to load diff.' }}
    </div>
    <div
      v-else-if="parseError"
      class="git-diff-preview-panel__empty git-diff-preview-panel__empty--error"
    >
      {{ parseError }}
    </div>
    <div
      v-else-if="files.length"
      class="git-diff-preview-panel__files"
    >
      <section
        v-for="file in files"
        :key="file.key"
        class="git-diff-preview-panel__file"
      >
        <button
          class="git-diff-preview-panel__file-header"
          type="button"
          :aria-expanded="isFileExpanded(file.key)"
          @click="toggleFile(file.key)"
        >
          <ChevronRightIcon
            class="git-diff-preview-panel__file-chevron"
            :class="{ 'git-diff-preview-panel__file-chevron--expanded': isFileExpanded(file.key) }"
            aria-hidden="true"
          />
          <strong>{{ file.title }}</strong>
          <span>{{ file.status }}</span>
        </button>

        <div
          v-if="isFileExpanded(file.key) && file.chunks.length"
          class="git-diff-preview-panel__chunks"
        >
          <div
            v-for="chunk in file.chunks"
            :key="chunk.key"
            class="git-diff-preview-panel__chunk"
          >
            <div class="git-diff-preview-panel__hunk">
              @@ -{{ chunk.fromStart }},{{ chunk.fromLines }} +{{ chunk.toStart }},{{ chunk.toLines }} @@<span v-if="chunk.context"> {{ chunk.context }}</span>
            </div>
            <div
              v-for="(line, index) in chunk.lines"
              :key="`${chunk.key}-${index}`"
              class="git-diff-preview-panel__line"
              :class="`git-diff-preview-panel__line--${line.kind}`"
            >
              <span class="git-diff-preview-panel__line-number">{{ line.oldNumber }}</span>
              <span class="git-diff-preview-panel__line-number">{{ line.newNumber }}</span>
              <span class="git-diff-preview-panel__line-marker">{{ line.marker }}</span>
              <code>{{ line.content }}</code>
            </div>
          </div>
        </div>
        <div
          v-else-if="isFileExpanded(file.key)"
          class="git-diff-preview-panel__empty git-diff-preview-panel__empty--file"
        >
          No textual hunks.
        </div>
      </section>
    </div>
    <div
      v-else
      class="git-diff-preview-panel__empty"
    >
      No diff content.
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import parseGitDiff, { type AnyChunk, type AnyFileChange, type Chunk } from 'parse-git-diff';
import { ChevronRightIcon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  diff: string;
  collapseAllSignal?: number;
  error?: string | null;
  expandAllSignal?: number;
  state?: 'idle' | 'loading' | 'error';
  wordWrap?: boolean;
}>(), {
  collapseAllSignal: 0,
  error: null,
  expandAllSignal: 0,
  state: 'idle',
  wordWrap: false,
});

const emit = defineEmits<{
  allExpandedChange: [isAllExpanded: boolean];
}>();

type DiffLineKind = 'added' | 'deleted' | 'context' | 'message';

type DiffLineView = {
  kind: DiffLineKind;
  oldNumber: string;
  newNumber: string;
  marker: string;
  content: string;
};

type DiffChunkView = {
  key: string;
  fromStart: number;
  fromLines: number;
  toStart: number;
  toLines: number;
  context: string;
  lines: DiffLineView[];
};

type DiffFileView = {
  key: string;
  title: string;
  status: string;
  chunks: DiffChunkView[];
};

const parsed = computed(() => {
  if (!props.diff.trim()) {
    return { files: [] as DiffFileView[], error: null as string | null };
  }

  try {
    const diff = parseGitDiff(props.diff);
    return {
      files: diff.files.map(mapFile),
      error: null,
    };
  } catch (error) {
    return {
      files: [] as DiffFileView[],
      error: error instanceof Error ? error.message : 'Unable to parse diff.',
    };
  }
});

const files = computed(() => parsed.value.files);
const parseError = computed(() => parsed.value.error);
const collapsedFileKeys = ref(new Set<string>());
const isAllExpanded = computed(() => collapsedFileKeys.value.size === 0);

watch(files, (nextFiles) => {
  const nextFileKeys = new Set(nextFiles.map((file) => file.key));
  collapsedFileKeys.value = new Set([...collapsedFileKeys.value].filter((key) => nextFileKeys.has(key)));
});

watch(() => props.expandAllSignal, () => {
  collapsedFileKeys.value = new Set();
});

watch(() => props.collapseAllSignal, () => {
  collapsedFileKeys.value = new Set(files.value.map((file) => file.key));
});

watch(isAllExpanded, (nextIsAllExpanded) => {
  emit('allExpandedChange', nextIsAllExpanded);
}, { immediate: true });

function isFileExpanded(fileKey: string): boolean {
  return !collapsedFileKeys.value.has(fileKey);
}

function toggleFile(fileKey: string): void {
  const nextCollapsedKeys = new Set(collapsedFileKeys.value);
  if (nextCollapsedKeys.has(fileKey)) {
    nextCollapsedKeys.delete(fileKey);
  } else {
    nextCollapsedKeys.add(fileKey);
  }
  collapsedFileKeys.value = nextCollapsedKeys;
}

function mapFile(file: AnyFileChange): DiffFileView {
  const title = file.type === 'RenamedFile'
    ? `${file.pathBefore} -> ${file.pathAfter}`
    : file.path;
  return {
    key: `${file.type}:${title}`,
    title,
    status: fileStatusLabel(file),
    chunks: file.chunks.map((chunk, index) => mapChunk(chunk, `${title}:${index}`)).filter((chunk): chunk is DiffChunkView => Boolean(chunk)),
  };
}

function fileStatusLabel(file: AnyFileChange): string {
  switch (file.type) {
    case 'AddedFile':
      return 'added';
    case 'DeletedFile':
      return 'deleted';
    case 'RenamedFile':
      return 'renamed';
    case 'ChangedFile':
      return 'modified';
  }
}

function mapChunk(chunk: AnyChunk, key: string): DiffChunkView | null {
  if (chunk.type !== 'Chunk') {
    return null;
  }

  return {
    key,
    fromStart: chunk.fromFileRange.start,
    fromLines: chunk.fromFileRange.lines,
    toStart: chunk.toFileRange.start,
    toLines: chunk.toFileRange.lines,
    context: chunk.context ?? '',
    lines: chunk.changes.map(mapLine),
  };
}

function mapLine(line: Chunk['changes'][number]): DiffLineView {
  switch (line.type) {
    case 'AddedLine':
      return {
        kind: 'added',
        oldNumber: '',
        newNumber: String(line.lineAfter),
        marker: '+',
        content: line.content,
      };
    case 'DeletedLine':
      return {
        kind: 'deleted',
        oldNumber: String(line.lineBefore),
        newNumber: '',
        marker: '-',
        content: line.content,
      };
    case 'UnchangedLine':
      return {
        kind: 'context',
        oldNumber: String(line.lineBefore),
        newNumber: String(line.lineAfter),
        marker: ' ',
        content: line.content,
      };
    case 'MessageLine':
      return {
        kind: 'message',
        oldNumber: '',
        newNumber: '',
        marker: '\\',
        content: line.content,
      };
  }
}
</script>

<style scoped>
.git-diff-preview-panel {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  background: var(--color-surface-lowest);
  font-family: var(--font-family-mono);
  font-size: var(--code-font-size, var(--font-size-13));
  line-height: var(--line-height-20);
  scrollbar-width: thin;
}

.git-diff-preview-panel__files {
  display: grid;
  min-width: max-content;
}

.git-diff-preview-panel--wrap .git-diff-preview-panel__files {
  min-width: 0;
}

.git-diff-preview-panel__file {
  overflow: hidden;
  border-bottom: 1px solid var(--color-border);
}

.git-diff-preview-panel__file-header {
  position: sticky;
  top: 0;
  z-index: 1;
  width: 100%;
  display: grid;
  grid-template-columns: var(--icon-md) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-8);
  border: 0;
  border-bottom: 1px solid var(--color-border);
  color: inherit;
  background: var(--color-surface-low);
  font-family: var(--font-family-base);
  text-align: left;
  cursor: pointer;
}

.git-diff-preview-panel__file-header:hover {
  background: var(--color-surface-base);
}

.git-diff-preview-panel__file-header:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.git-diff-preview-panel__file-chevron {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
  transition: transform 120ms ease;
}

.git-diff-preview-panel__file-chevron--expanded {
  transform: rotate(90deg);
}

.git-diff-preview-panel__file-header strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--font-weight-semibold);
}

.git-diff-preview-panel__file-header span {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  text-transform: uppercase;
}

.git-diff-preview-panel__hunk {
  padding: var(--space-2) var(--space-8);
  color: var(--color-secondary);
  background: color-mix(in srgb, var(--color-secondary) 10%, var(--color-surface-low));
  white-space: pre;
}

.git-diff-preview-panel__line {
  display: grid;
  grid-template-columns: 5ch 5ch 2ch minmax(0, 1fr);
  min-height: var(--line-height-20);
  color: var(--color-text);
  white-space: pre;
}

.git-diff-preview-panel__line--added {
  background: var(--color-success-container);
}

.git-diff-preview-panel__line--deleted {
  background: var(--color-error-container);
}

.git-diff-preview-panel__line--message {
  color: var(--color-text-muted);
}

.git-diff-preview-panel__line-number,
.git-diff-preview-panel__line-marker {
  user-select: none;
  color: var(--color-text-muted);
  text-align: right;
}

.git-diff-preview-panel__line-marker {
  text-align: center;
}

.git-diff-preview-panel__line--added .git-diff-preview-panel__line-marker {
  color: var(--color-success);
}

.git-diff-preview-panel__line--deleted .git-diff-preview-panel__line-marker {
  color: var(--color-error);
}

.git-diff-preview-panel__line code {
  padding-right: var(--space-8);
  overflow: hidden;
  font-family: inherit;
  text-overflow: clip;
}

.git-diff-preview-panel--wrap .git-diff-preview-panel__hunk,
.git-diff-preview-panel--wrap .git-diff-preview-panel__line {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.git-diff-preview-panel--wrap .git-diff-preview-panel__line code {
  overflow: visible;
}

.git-diff-preview-panel__empty {
  padding: var(--space-8);
  color: var(--color-text-muted);
  font-family: var(--font-family-base);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.git-diff-preview-panel__empty--error {
  color: var(--color-error);
}

.git-diff-preview-panel__empty--file {
  font-family: var(--font-family-mono);
}
</style>
