<template>
  <div
    ref="menuRoot"
    class="team-context-menu"
    :style="menuStyle"
  >
    <AppMenu
      ariaLabel="Team actions"
      :items="menuItems"
      @select="selectMenuItem"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Team } from '@codex-claw/shared/contracts';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import { ExternalLinkIcon, PencilIcon, Trash2Icon, X } from '../shared/icons/app-icons';

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
  'request-disconnect-team': [teamId: string];
}>();

const menuRoot = ref<HTMLElement | null>(null);
const menuStyle = computed<Record<string, string>>(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
}));
const menuItems = computed<AppMenuItem[]>(() => [
  {
    id: 'edit-team',
    type: 'action',
    label: 'Edit Team',
    icon: PencilIcon,
  },
  ...(props.team.remoteConnectionId ? [{
    id: 'disconnect-team',
    type: 'action' as const,
    label: 'Disconnect',
    icon: ExternalLinkIcon,
    disabled: !props.canClose,
  }] : []),
  { id: 'group-danger', type: 'separator' },
  {
    id: 'close-team',
    type: 'action',
    label: props.team.remoteConnectionId ? 'Delete Team' : 'Close Team',
    icon: props.team.remoteConnectionId ? Trash2Icon : X,
    danger: true,
    disabled: !props.canClose,
  },
]);

onMounted(() => {
  document.addEventListener('click', closeOnDocumentClick);
  document.addEventListener('keydown', closeOnEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnDocumentClick);
  document.removeEventListener('keydown', closeOnEscape);
});

function selectMenuItem(itemId: string): void {
  if (itemId === 'edit-team') {
    emit('edit-team', props.team.id);
  } else if (itemId === 'disconnect-team' && props.canClose) {
    emit('request-disconnect-team', props.team.id);
  } else if (itemId === 'close-team' && props.canClose) {
    emit('request-close-team', props.team.id);
  }
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

<style scoped>
.team-context-menu {
  position: fixed;
  z-index: 20;
}
</style>
