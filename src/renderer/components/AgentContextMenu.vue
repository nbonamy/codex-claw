<template>
  <div
    ref="menuRoot"
    class="claw-context-menu agent-context-menu"
    :style="menuStyle"
    role="menu"
    aria-label="Agent actions"
  >
    <button
      class="claw-context-menu__action"
      type="button"
      role="menuitem"
      @click="selectAction('edit-agent')"
    >
      <PencilIcon class="claw-context-menu__icon" />
      <span>Edit Agent</span>
    </button>
    <button
      class="claw-context-menu__action"
      type="button"
      role="menuitem"
      @click="selectAction('duplicate-agent')"
    >
      <CopyIcon class="claw-context-menu__icon" />
      <span>Duplicate Agent</span>
    </button>

    <div
      class="claw-context-menu__separator"
      role="separator"
    />

    <button
      class="claw-context-menu__action"
      type="button"
      role="menuitem"
      @click="selectAction('move-agent-to-team')"
    >
      <SwitchHorizontalIcon class="claw-context-menu__icon" />
      <span>Move to Other Team</span>
    </button>
    <button
      class="claw-context-menu__action"
      type="button"
      role="menuitem"
      @click="selectAction('save-agent-to-bench')"
    >
      <SaveToBenchIcon class="claw-context-menu__icon" />
      <span>Save to Bench</span>
    </button>

    <div
      class="claw-context-menu__separator"
      role="separator"
    />

    <button
      class="claw-context-menu__action"
      type="button"
      role="menuitem"
      @click="selectAction('restart-agent')"
    >
      <RefreshIcon class="claw-context-menu__icon" />
      <span>Restart Agent</span>
    </button>
    <button
      class="claw-context-menu__action"
      type="button"
      role="menuitem"
      @click="selectAction('close-agent')"
    >
      <X class="claw-context-menu__icon" />
      <span>Close Agent</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  CopyIcon,
  PencilIcon,
  RefreshIcon,
  SaveToBenchIcon,
  SwitchHorizontalIcon,
  X,
} from '../shared/icons/app-icons';

export type AgentContextMenuAction =
  | 'close-agent'
  | 'duplicate-agent'
  | 'edit-agent'
  | 'move-agent-to-team'
  | 'restart-agent'
  | 'save-agent-to-bench';

const props = defineProps<{
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  action: [action: AgentContextMenuAction];
  close: [];
}>();

const menuRoot = ref<HTMLElement | null>(null);
const menuStyle = computed<Record<string, string>>(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
}));

onMounted(() => {
  document.addEventListener('click', closeOnDocumentClick);
  document.addEventListener('keydown', closeOnEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnDocumentClick);
  document.removeEventListener('keydown', closeOnEscape);
});

function selectAction(action: AgentContextMenuAction): void {
  emit('action', action);
}

function closeOnDocumentClick(event: MouseEvent): void {
  if (event.target instanceof Node && menuRoot.value?.contains(event.target)) {
    return;
  }

  emit('close');
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close');
  }
}
</script>
