<template>
  <div
    ref="menuRoot"
    class="claw-context-menu team-context-menu"
    :style="menuStyle"
    role="menu"
    aria-label="Team actions"
  >
    <button
      class="claw-context-menu__action"
      type="button"
      role="menuitem"
      @click="emit('edit-team', team.id)"
    >
      <PencilIcon class="claw-context-menu__icon" />
      <span>Edit Team</span>
    </button>

    <div
      class="claw-context-menu__separator"
      role="separator"
    />

    <button
      class="claw-context-menu__action claw-context-menu__action--danger"
      type="button"
      role="menuitem"
      :disabled="!canClose"
      @click="requestCloseTeam"
    >
      <X class="claw-context-menu__icon" />
      <span>Close Team</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Team } from '../../shared/contracts';
import { PencilIcon, X } from '../shared/icons/app-icons';

const props = defineProps<{
  canClose: boolean;
  team: Team;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  close: [];
  'edit-team': [teamId: string];
  'request-close-team': [teamId: string];
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

function requestCloseTeam(): void {
  if (!props.canClose) {
    return;
  }

  emit('request-close-team', props.team.id);
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
