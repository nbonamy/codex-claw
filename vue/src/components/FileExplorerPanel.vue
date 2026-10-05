<template>
  <section class="file-explorer" :aria-label="$t('surface.fileExplorerPanel.workspaceFiles')">
    <header class="file-explorer__toolbar">
      <input
        ref="searchInput"
        v-model="query"
        type="search"
        :aria-label="$t('surface.fileExplorerPanel.searchWorkspaceFiles')"
        :placeholder="$t('surface.fileExplorerPanel.searchFiles')"
        @keydown.escape="query = ''"
      />
    </header>

    <p v-if="loading && files.length === 0" class="file-explorer__status">{{ $t('surface.fileExplorerPanel.loadingFiles') }}</p>
    <p v-else-if="error" class="file-explorer__status file-explorer__status--error">{{ error }}</p>
    <p v-else-if="files.length === 0" class="file-explorer__status">{{ $t('surface.fileExplorerPanel.noFilesInThisWorkspace') }}</p>
    <p v-else-if="visibleRows.length === 0" class="file-explorer__status">{{ $t('surface.fileExplorerPanel.noMatchingFiles') }}</p>

    <div v-else class="file-explorer__tree" role="tree" :aria-label="$t('surface.fileExplorerPanel.workspaceFileTree')">
      <div
        v-for="row in visibleRows"
        :key="`${row.kind}:${row.path}`"
        class="file-explorer__row"
        :style="{ paddingInlineStart: `${8 + row.depth * 16}px` }"
        role="treeitem"
        :aria-expanded="row.kind === 'folder' ? expanded.has(row.path) : undefined"
      >
        <button
          v-if="row.kind === 'folder'"
          class="file-explorer__item file-explorer__folder"
          type="button"
          @click="toggleFolder(row.path)"
        >
          <ChevronRightIcon :class="{ 'file-explorer__chevron--open': expanded.has(row.path) }" aria-hidden="true" />
          <FolderIcon aria-hidden="true" />
          <span>{{ row.name }}</span>
        </button>
        <button
          v-else
          class="file-explorer__item file-explorer__file"
          type="button"
          :title="$t('dynamic.files.preview', { path: row.path })"
          @click="emit('preview', row.path)"
        >
          <FileTextIcon aria-hidden="true" />
          <span>{{ row.name }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import type { AgentFileSearchItem } from '@workspace/core/contracts';
import { ChevronRightIcon, FileTextIcon, FolderIcon } from '../shared/icons/app-icons';

type ExplorerRow = { id: string; kind: 'folder' | 'file'; name: string; path: string; depth: number };
type ExplorerNode = { kind: 'folder'; name: string; path: string; folders: Map<string, ExplorerNode>; files: AgentFileSearchItem[] };

const props = withDefaults(defineProps<{
  files: AgentFileSearchItem[];
  loading?: boolean;
  error?: string | null;
}>(), { loading: false, error: null });

const emit = defineEmits<{
  preview: [path: string];
}>();

const query = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const expanded = ref(new Set<string>());

const visibleRows = computed<ExplorerRow[]>(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  const matchingFiles = needle
    ? props.files.filter((file) => file.path.toLocaleLowerCase().includes(needle))
    : props.files;
  const root = folderNode('', '');
  for (const file of matchingFiles) {
    const parts = file.path.split('/');
    let parent = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const folderPath = parts.slice(0, index + 1).join('/');
      const name = parts[index]!;
      const existing = parent.folders.get(name);
      const folder = existing ?? folderNode(name, folderPath);
      if (!existing) parent.folders.set(name, folder);
      parent = folder;
    }
    parent.files.push(file);
  }
  const rows: ExplorerRow[] = [];
  flattenFolder(root, -1, rows, Boolean(needle));
  return rows;
});

onMounted(() => void nextTick(() => searchInput.value?.focus()));

function fileRow(file: AgentFileSearchItem, depth: number): ExplorerRow {
  return { id: encodeURIComponent(file.path), kind: 'file', name: file.name, path: file.path, depth };
}

function folderNode(name: string, path: string): ExplorerNode {
  return { kind: 'folder', name, path, folders: new Map(), files: [] };
}

function flattenFolder(folder: ExplorerNode, depth: number, rows: ExplorerRow[], forceExpanded = false): void {
  const folders = [...folder.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const child of folders) {
    rows.push({ id: child.path, kind: 'folder', name: child.name, path: child.path, depth: depth + 1 });
    if (forceExpanded || expanded.value.has(child.path)) flattenFolder(child, depth + 1, rows, forceExpanded);
  }
  for (const file of folder.files.sort((a, b) => a.name.localeCompare(b.name))) {
    rows.push(fileRow(file, depth + 1));
  }
}

function toggleFolder(path: string): void {
  const next = new Set(expanded.value);
  if (next.has(path)) next.delete(path); else next.add(path);
  expanded.value = next;
}

</script>

<style scoped>
.file-explorer {
  min-width: 0;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-shell-main);
}

.file-explorer__toolbar {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border);
}

.file-explorer__toolbar input {
  min-width: 0;
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--color-surface-low);
}

.file-explorer__tree {
  min-height: 0;
  overflow: auto;
  padding-block: var(--space-2);
}

.file-explorer__row {
  min-width: 0;
  min-height: 30px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-inline-end: var(--space-2);
}

.file-explorer__row:hover {
  background: var(--color-surface-low);
}

.file-explorer__item {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 0;
  color: var(--color-text);
  background: transparent;
  text-align: left;
}

.file-explorer__item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-explorer__item svg {
  width: var(--icon-sm);
  height: var(--icon-sm);
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.file-explorer__folder svg:first-child {
  transition: transform 120ms ease;
}

.file-explorer__folder .file-explorer__chevron--open {
  transform: rotate(90deg);
}

.file-explorer__status {
  margin: auto;
  padding: var(--space-8);
  color: var(--color-text-muted);
  text-align: center;
}

.file-explorer__status--error {
  color: var(--color-error);
}
</style>
