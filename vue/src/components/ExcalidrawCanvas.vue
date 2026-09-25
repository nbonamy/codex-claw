<template>
  <div class="visualize-editor">
    <div class="visualize-editor__toolbar">
      <button type="button" class="claw-button claw-button--tertiary visualize-editor__action" :disabled="!ready" :aria-pressed="editing" :aria-label="translate(editing ? 'visualize.doneEditing' : 'visualize.editCanvas')" :title="translate(editing ? 'visualize.doneEditing' : 'visualize.editCanvas')" @click="toggleEditing">
        <CheckIcon v-if="editing" :stroke-width="1" aria-hidden="true" />
        <PencilIcon v-else :stroke-width="1" aria-hidden="true" />
      </button>
      <button type="button" class="claw-button claw-button--tertiary visualize-editor__action" :disabled="!ready" :aria-label="translate('visualize.fitCanvas')" :title="translate('visualize.fitCanvas')" @click="editor?.fit()">
        <ArrowsMinimizeIcon :stroke-width="1" aria-hidden="true" />
      </button>
    </div>
    <div ref="host" class="visualize-editor__host" />
    <div v-if="error || !ready || saving || dirty" class="visualize-editor__status">
      <span role="status">{{ error || translate(!ready ? 'common.loading' : 'visualize.saving') }}</span>
      <button v-if="error" type="button" class="claw-button claw-button--secondary" @click="retry">{{ translate('visualize.retrySave') }}</button>
    </div>
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, toRaw } from 'vue';
import { type CanvasDocument, type SaveCanvasInput } from '@codex-claw/core/visualize-canvas';
import type { Visualization } from '@codex-claw/core/visualize';
import type { CanvasScene, mountCanvas } from './excalidraw-editor';
import { translate } from '../i18n';
import { ArrowsMinimizeIcon, CheckIcon, PencilIcon } from '../shared/icons/app-icons';
const props = defineProps<{
  visualization: Visualization;
  sessionId: string;
  imageSource?: string;
  save: (input: SaveCanvasInput) => Promise<CanvasDocument>;
}>();
const host = ref<HTMLElement>();
const ready = ref(false);
const saving = ref(false);
const dirty = ref(false);
const editing = ref(false);
const error = ref('');
let editor: ReturnType<typeof mountCanvas> | undefined;
let revision = props.visualization.canvas?.revision ?? 0;
let baseKey = '';
let needsPreview = false;
let local: CanvasScene | undefined;
let incoming: CanvasDocument | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Promise<void> | undefined;
let disposed = false;
const key = (scene: CanvasScene) => JSON.stringify([scene.elements, scene.files, scene.selectedElementIds]);
function changed(scene: CanvasScene) {
  local = scene;
  dirty.value = key(scene) !== baseKey;
  if (key(scene) === baseKey || error.value) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void flush(); }, 180);
}
function receive(document: CanvasDocument | undefined) {
  if (!document || document.revision <= revision) return;
  if (saving.value) { incoming = document; return; }
  if (local && key(local) !== baseKey) {
    incoming = document;
    error.value = translate('visualize.canvasConflict');
    return;
  }
  revision = document.revision;
  needsPreview = !document.preview;
  baseKey = key(document);
  local = structuredClone(toRaw(document));
  editor?.update(local, true);
  if (needsPreview) { clearTimeout(timer); timer = setTimeout(() => { void flush(); }, 180); }
}
watch(() => props.visualization.canvas, receive);
async function flush(): Promise<void> {
  clearTimeout(timer);
  if (pending) { await pending; if (local && key(local) !== baseKey && !error.value) await flush(); return; }
  if (!local || error.value || (key(local) === baseKey && !needsPreview)) return;
  const scene = structuredClone(toRaw(local));
  const sentKey = key(scene);
  saving.value = true;
  pending = (async () => {
    try {
      scene.preview = await editor!.preview(scene);
      const saved = await props.save({ sessionId: props.sessionId, expectedSource: JSON.stringify(props.visualization.content), visualizationId: props.visualization.id, expectedRevision: revision, document: scene });
      revision = saved.revision;
      needsPreview = false;
      baseKey = sentKey;
      dirty.value = !!local && key(local) !== baseKey;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      saving.value = false;
      pending = undefined;
      if (incoming) { const document = incoming; incoming = undefined; receive(document); }
    }
  })();
  await pending;
  if (local && key(local) !== baseKey && !error.value) await flush();
}
function toggleEditing() {
  editing.value = !editing.value;
  editor?.setEditing(editing.value);
}
function retry() {
  // Keep local work on failure. A stale revision requires an explicit reload rather than a blind overwrite.
  error.value = '';
  void flush();
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || saving.value) { event.preventDefault(); event.returnValue = ''; }
}
onMounted(async () => {
  window.addEventListener('beforeunload', beforeUnload);
  try {
    const module = await import('./excalidraw-editor');
    const scene = await module.importVisualization(toRaw(props.visualization), props.imageSource ?? '');
    if (disposed || !host.value) return;
    local = scene;
    baseKey = props.visualization.canvas ? key(scene) : '';
    editor = module.mountCanvas(host.value, scene, changed, cause => { error.value = cause.message; });
    ready.value = true;
    if (!props.visualization.canvas) changed(scene);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
});
onBeforeUnmount(() => {
  disposed = true;
  window.removeEventListener('beforeunload', beforeUnload);
  clearTimeout(timer);
  void flush();
  editor?.dispose();
});
</script>
<style scoped>
.visualize-editor {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.visualize-editor__toolbar {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0;
  max-width: calc(100% - 16px);
  padding: 0;
  border: 0;
  border-radius: var(--visualize-control-radius, var(--radius-md));
  overflow: hidden;
  background: var(--visualize-control-background, var(--color-surface-low));
  color: var(--visualize-control-foreground, var(--color-text));
  font-size: var(--font-size-12);
}
.visualize-editor__action {
  width: var(--visualize-control-size, 36px);
  height: var(--visualize-control-size, 36px);
  min-width: 0;
  min-height: 0;
  border: 0;
  border-radius: 0;
  color: inherit;
  padding: 0;
}
.visualize-editor__action svg {
  width: 18px;
  height: 18px;
}
.visualize-editor__host {
  flex: 1;
  min-height: 240px;
}
/* Keep unrelated editor menus out of the embedded canvas. */
.visualize-editor__host :deep(.main-menu-trigger),
.visualize-editor__host :deep(.help-icon),
.visualize-editor__host :deep(.sidebar-trigger__label-element:has(.default-sidebar-trigger)) {
  display: none;
}
.visualize-editor__status {
  padding: var(--space-8);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}
</style>
