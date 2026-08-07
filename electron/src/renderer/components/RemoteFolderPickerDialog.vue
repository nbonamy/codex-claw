<template>
  <el-dialog
    :model-value="visible"
    :title="title"
    width="560px"
    append-to-body
    class="claw-dialog remote-folder-picker-dialog"
    @update:model-value="onVisibilityChanged"
  >
    <div class="remote-folder-picker-dialog__content">
      <div class="remote-folder-picker-dialog__path">
        <input
          v-model="folderPath"
          class="claw-form-dialog__text-input"
          type="text"
          aria-label="Remote folder path"
          placeholder="$HOME"
          @keydown.enter.prevent="loadFolders(folderPath)"
        />
        <el-button
          :loading="loading"
          @click="loadFolders(folderPath)"
        >
          Go
        </el-button>
      </div>

      <p
        v-if="errorMessage"
        class="remote-folder-picker-dialog__error"
      >
        {{ errorMessage }}
      </p>

      <div
        v-if="loading && folderEntries.length === 0"
        class="remote-folder-picker-dialog__empty"
      >
        Loading folders...
      </div>
      <div
        v-else
        class="remote-folder-picker-dialog__list"
      >
        <button
          v-if="folderListing?.parentPath"
          type="button"
          class="remote-folder-picker-dialog__row"
          @click="loadFolders(folderListing.parentPath)"
        >
          <FolderIcon aria-hidden="true" />
          <span>..</span>
        </button>
        <button
          v-for="entry in folderEntries"
          :key="entry.path"
          type="button"
          class="remote-folder-picker-dialog__row"
          @click="loadFolders(entry.path)"
        >
          <FolderIcon aria-hidden="true" />
          <span>{{ entry.name }}</span>
        </button>
        <div
          v-if="!loading && folderEntries.length === 0 && !folderListing?.parentPath"
          class="remote-folder-picker-dialog__empty"
        >
          No folders
        </div>
      </div>
    </div>

    <template #footer>
      <div class="claw-dialog__footer">
        <el-button @click="close">Cancel</el-button>
        <el-button
          type="primary"
          :disabled="!folderPath.trim()"
          @click="selectFolder"
        >
          Select this folder
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SourceFolderListing, SourceFolderListInput } from '@codex-claw/core/contracts';
import { FolderIcon } from '../shared/icons/app-icons';

const props = withDefaults(defineProps<{
  initialPath?: string;
  listSourceFolders: (input?: SourceFolderListInput) => Promise<SourceFolderListing>;
  remoteConnectionId: string;
  title?: string;
  visible: boolean;
}>(), {
  initialPath: '',
  title: 'Choose remote folder',
});

const emit = defineEmits<{
  close: [];
  select: [path: string];
}>();

const loading = ref(false);
const errorMessage = ref<string | null>(null);
const folderPath = ref('');
const folderListing = ref<SourceFolderListing | null>(null);

const folderEntries = computed(() => folderListing.value?.entries ?? []);

watch(() => props.visible, async (visible) => {
  if (!visible) {
    reset();
    return;
  }

  errorMessage.value = null;
  folderPath.value = props.initialPath.trim();
  await loadFolders(folderPath.value || undefined);
});

async function loadFolders(path?: string | null): Promise<void> {
  if (!props.remoteConnectionId) {
    return;
  }

  loading.value = true;
  errorMessage.value = null;
  try {
    const listing = await props.listSourceFolders({
      remoteConnectionId: props.remoteConnectionId,
      ...(path?.trim() ? { path: path.trim() } : {}),
    });
    folderListing.value = listing;
    folderPath.value = listing.path;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    loading.value = false;
  }
}

function selectFolder(): void {
  const selectedFolder = folderPath.value.trim();
  if (!selectedFolder) {
    return;
  }

  emit('select', selectedFolder);
  close();
}

function onVisibilityChanged(nextVisible: boolean): void {
  if (!nextVisible) {
    close();
  }
}

function close(): void {
  emit('close');
}

function reset(): void {
  loading.value = false;
  errorMessage.value = null;
  folderPath.value = '';
  folderListing.value = null;
}
</script>

<style scoped>
.remote-folder-picker-dialog__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.remote-folder-picker-dialog__path {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-8);
  align-items: center;
}

.remote-folder-picker-dialog__error {
  margin: 0;
  color: var(--color-error);
  font-size: var(--font-size-13);
}

.remote-folder-picker-dialog__list {
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow: auto;
  border: 1px solid var(--color-border);
}

.remote-folder-picker-dialog__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-8);
  width: 100%;
  padding: var(--space-8) var(--space-10);
  border: 0;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.remote-folder-picker-dialog__row:last-child {
  border-bottom: 0;
}

.remote-folder-picker-dialog__row:hover,
.remote-folder-picker-dialog__row:focus-visible {
  background: var(--color-surface-low);
}

.remote-folder-picker-dialog__row svg {
  width: var(--icon-md);
  height: var(--icon-md);
  color: var(--color-text-muted);
}

.remote-folder-picker-dialog__row span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-folder-picker-dialog__empty {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  padding: var(--space-10);
}
</style>
