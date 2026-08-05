<template>
  <div
    ref="menuRoot"
    class="agent-context-menu"
    :style="menuStyle"
  >
    <AppMenu
      ariaLabel="Agent actions"
      :items="menuItems"
      @select="selectMenuItem"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Team } from '@codex-claw/shared/contracts';
import { defaultTeamColor } from '@codex-claw/shared/team-colors';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import {
  CopyIcon,
  GitForkIcon,
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
  | 'fork-agent'
  | 'restart-agent'
  | 'save-agent-to-bench';

const props = defineProps<{
  moveTargets?: Team[];
  forkDisabled?: boolean;
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  action: [action: AgentContextMenuAction];
  close: [];
  'move-agent-to-team': [teamId: string];
}>();

const menuRoot = ref<HTMLElement | null>(null);
const moveTargets = computed(() => props.moveTargets ?? []);
const menuStyle = computed<Record<string, string>>(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
}));
const menuItems = computed<AppMenuItem[]>(() => [
  {
    id: 'edit-agent',
    type: 'action',
    label: 'Edit Agent',
    icon: PencilIcon,
  },
  {
    id: 'duplicate-agent',
    type: 'action',
    label: 'Duplicate Agent',
    icon: CopyIcon,
  },
  {
    id: 'fork-agent',
    type: 'action',
    label: 'Fork Agent',
    icon: GitForkIcon,
    disabled: props.forkDisabled === true,
  },
  { id: 'group-primary', type: 'separator' },
  {
    id: 'move-to-team',
    type: 'submenu',
    label: 'Move to Other Team',
    icon: SwitchHorizontalIcon,
    disabled: moveTargets.value.length === 0,
    items: moveTargets.value.map((team) => ({
      id: moveTeamItemId(team.id),
      type: 'action',
      label: team.name,
      leadingColor: team.color ?? defaultTeamColor,
    })),
  },
  {
    id: 'save-agent-to-bench',
    type: 'action',
    label: 'Save to Bench',
    icon: SaveToBenchIcon,
  },
  { id: 'group-danger', type: 'separator' },
  {
    id: 'restart-agent',
    type: 'action',
    label: 'Restart Agent',
    icon: RefreshIcon,
  },
  {
    id: 'close-agent',
    type: 'action',
    label: 'Close Agent',
    icon: X,
    danger: true,
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
  const teamId = teamIdFromMoveItemId(itemId);
  if (teamId) {
    emit('move-agent-to-team', teamId);
    return;
  }

  if (isAgentContextMenuAction(itemId)) {
    emit('action', itemId);
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

function moveTeamItemId(teamId: string): string {
  return `move-to-team:${teamId}`;
}

function teamIdFromMoveItemId(itemId: string): string | null {
  return itemId.startsWith('move-to-team:') ? itemId.slice('move-to-team:'.length) : null;
}

function isAgentContextMenuAction(itemId: string): itemId is AgentContextMenuAction {
  return itemId === 'close-agent' ||
    itemId === 'duplicate-agent' ||
    itemId === 'edit-agent' ||
    itemId === 'fork-agent' ||
    itemId === 'restart-agent' ||
    itemId === 'save-agent-to-bench';
}
</script>

<style scoped>
.agent-context-menu {
  position: fixed;
  z-index: 20;
}
</style>
