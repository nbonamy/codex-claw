<template>
  <div
    class="cockpit-view__add-card"
    :class="{ 'cockpit-view__add-card--drop-choice': showDropChoices }"
    @dragenter="enterDropChoice"
    @dragleave="leaveDropChoice"
    @dragover="allowDropChoice"
    @click="createAgentFromCard"
  >
    <div
      v-if="showDropChoices"
      class="cockpit-view__add-drop-targets"
    >
      <button
        class="cockpit-view__add-drop-target"
        :class="{ 'cockpit-view__add-drop-target--active': activeDropTarget === 'new-agent' }"
        type="button"
        :aria-label="$t('dynamic.cockpit.assignNewAgent', { team: teamName })"
        @dragenter="activateDropTarget('new-agent', $event)"
        @dragover="activateDropTarget('new-agent', $event)"
        @dragleave="deactivateDropTarget('new-agent', $event)"
        @drop="dropToNewAgent"
      > {{ $t('surface.cockpitAddAgentTile.assignToNewAgent') }} </button>
      <button
        class="cockpit-view__add-drop-target"
        :class="{
          'cockpit-view__add-drop-target--active': activeDropTarget === 'bench-agent',
          'cockpit-view__add-drop-target--disabled': !canAssignToBench,
        }"
        type="button"
        :aria-label="$t('dynamic.cockpit.assignBenchAgent', { team: teamName })"
        :disabled="!canAssignToBench"
        @dragenter="activateDropTarget('bench-agent', $event)"
        @dragover="activateDropTarget('bench-agent', $event)"
        @dragleave="deactivateDropTarget('bench-agent', $event)"
        @drop="dropToBenchAgent"
      > {{ $t('surface.cockpitAddAgentTile.assignToBenchAgent') }} </button>
    </div>

    <NewAgentButton
      v-else
      class="cockpit-view__add-button"
      :label="$t('surface.cockpitAddAgentTile.addAgent')"
      presentation="tile"
      tone="muted"
      :bench="bench"
      @deploy-bench-template="emit('deploy-bench-template', { templateId: $event, teamId })"
      @new-agent="emit('new-agent', teamId)"
      @remove-bench-template="emit('remove-bench-template', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BenchTemplate, DeployBenchTemplateInput, WorkItem } from '@codex-claw/core/contracts';
import NewAgentButton from './NewAgentButton.vue';

type DropTargetKind = 'new-agent' | 'bench-agent';

const props = defineProps<{
  bench: BenchTemplate[];
  draggedWorkItem: WorkItem | null;
  teamId: string;
  teamName: string;
}>();

const emit = defineEmits<{
  'assign-to-bench-agent': [payload: { item: WorkItem; teamId: string }];
  'assign-to-new-agent': [payload: { item: WorkItem; teamId: string }];
  'deploy-bench-template': [input: DeployBenchTemplateInput];
  'new-agent': [teamId: string];
  'remove-bench-template': [templateId: string];
}>();

const dropChoiceActive = ref(false);
const activeDropTarget = ref<DropTargetKind | null>(null);
const canAssignToBench = computed(() => props.bench.length > 0);
const showDropChoices = computed(() => Boolean(props.draggedWorkItem && dropChoiceActive.value));

watch(() => props.draggedWorkItem, (item) => {
  if (!item) {
    dropChoiceActive.value = false;
    activeDropTarget.value = null;
  }
});

function enterDropChoice(event: DragEvent): void {
  if (!props.draggedWorkItem) {
    return;
  }

  event.preventDefault();
  dropChoiceActive.value = true;
}

function leaveDropChoice(event: DragEvent): void {
  if (!props.draggedWorkItem) {
    return;
  }

  const target = event.currentTarget;
  if (target instanceof HTMLElement && event.relatedTarget instanceof Node && target.contains(event.relatedTarget)) {
    return;
  }

  dropChoiceActive.value = false;
  activeDropTarget.value = null;
}

function allowDropChoice(event: DragEvent): void {
  if (!props.draggedWorkItem) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

function activateDropTarget(target: DropTargetKind, event: DragEvent): void {
  if (!props.draggedWorkItem || (target === 'bench-agent' && !canAssignToBench.value)) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
  activeDropTarget.value = target;
}

function deactivateDropTarget(target: DropTargetKind, event: DragEvent): void {
  if (activeDropTarget.value !== target) {
    return;
  }

  const currentTarget = event.currentTarget;
  if (
    currentTarget instanceof HTMLElement &&
    event.relatedTarget instanceof Node &&
    currentTarget.contains(event.relatedTarget)
  ) {
    return;
  }

  activeDropTarget.value = null;
}

function dropToNewAgent(event: DragEvent): void {
  const item = props.draggedWorkItem;
  if (!item) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  dropChoiceActive.value = false;
  activeDropTarget.value = null;
  emit('assign-to-new-agent', {
    item,
    teamId: props.teamId,
  });
}

function dropToBenchAgent(event: DragEvent): void {
  const item = props.draggedWorkItem;
  if (!item || !canAssignToBench.value) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  dropChoiceActive.value = false;
  activeDropTarget.value = null;
  emit('assign-to-bench-agent', {
    item,
    teamId: props.teamId,
  });
}

function createAgentFromCard(event: MouseEvent): void {
  if (showDropChoices.value || isInteractiveNewAgentButtonTarget(event.target)) {
    return;
  }

  emit('new-agent', props.teamId);
}

function isInteractiveNewAgentButtonTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest([
    '.new-agent-button__primary',
    '.new-agent-button__chevron',
    '.new-agent-menu',
  ].join(',')));
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

.cockpit-view__add-drop-targets {
  width: 100%;
  height: 100%;
  min-height: 172px;
  display: grid;
  grid-template-rows: 1fr 1fr;
  cursor: default;
}

.cockpit-view__add-drop-target {
  display: grid;
  place-items: center;
  border: 0;
  padding: var(--space-12);
  color: var(--color-text);
  background: transparent;
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
  cursor: copy;
}

.cockpit-view__add-drop-target + .cockpit-view__add-drop-target {
  border-top: 1px solid
    color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
}

.cockpit-view__add-drop-target--active,
.cockpit-view__add-drop-target:focus-visible {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  outline: none;
}

.cockpit-view__add-drop-target:focus-visible {
  box-shadow: inset 0 0 0 2px var(--color-primary);
}

.cockpit-view__add-drop-target:disabled,
.cockpit-view__add-drop-target--disabled {
  color: var(--color-text-muted);
  cursor: not-allowed;
  opacity: 0.58;
}
</style>
