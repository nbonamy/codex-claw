<template>
  <div
    class="cockpit-view__add-card"
    :class="{ 'cockpit-view__add-card--drop-active': dropActive }"
    @dragenter="activateDrop"
    @dragleave="deactivateDrop"
    @dragover="activateDrop"
    @drop="dropToNewAgent"
    @click="createAgentFromCard"
  >
    <div v-if="draggedWorkItem" class="cockpit-view__add-drop-target">
      {{ $t('surface.cockpitAddAgentTile.assignToNewAgent') }}
    </div>
    <NewAgentButton
      v-else
      class="cockpit-view__add-button"
      :label="$t('surface.cockpitAddAgentTile.addAgent')"
      presentation="tile"
      tone="muted"
      @new-agent="emit('new-agent', teamId)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { WorkItem } from '@codex-claw/core/contracts';
import NewAgentButton from './NewAgentButton.vue';

const props = defineProps<{
  draggedWorkItem: WorkItem | null;
  teamId: string;
}>();

const emit = defineEmits<{
  'assign-to-new-agent': [payload: { item: WorkItem; teamId: string }];
  'new-agent': [teamId: string];
}>();

const dropActive = ref(false);

watch(() => props.draggedWorkItem, (item) => {
  if (!item) dropActive.value = false;
});

function activateDrop(event: DragEvent): void {
  if (!props.draggedWorkItem) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  dropActive.value = true;
}

function deactivateDrop(event: DragEvent): void {
  if (!props.draggedWorkItem) return;
  const target = event.currentTarget;
  if (target instanceof HTMLElement && event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) {
    return;
  }
  dropActive.value = false;
}

function dropToNewAgent(event: DragEvent): void {
  const item = props.draggedWorkItem;
  if (!item) return;
  event.preventDefault();
  event.stopPropagation();
  dropActive.value = false;
  emit('assign-to-new-agent', { item, teamId: props.teamId });
}

function createAgentFromCard(event: MouseEvent): void {
  if (props.draggedWorkItem || isNewAgentButtonTarget(event.target)) return;
  emit('new-agent', props.teamId);
}

function isNewAgentButtonTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('.new-agent-button__primary'));
}
</script>

<style scoped>
.cockpit-view__add-card {
  width: min(100%, 360px);
  min-height: 172px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-surface-low) 48%, transparent);
  cursor: pointer;
}

.cockpit-view__add-card:hover,
.cockpit-view__add-card:focus-within {
  border-color: var(--color-border-strong);
  background: color-mix(in srgb, var(--color-surface-low) 80%, transparent);
}

.cockpit-view__add-card--drop-active {
  border-color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.cockpit-view__add-drop-target {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  padding: var(--space-12);
  color: var(--color-primary);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
  cursor: copy;
}
</style>
