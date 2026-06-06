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

    <div
      class="claw-context-menu__submenu"
    >
      <button
        class="claw-context-menu__action"
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        :aria-expanded="canMoveToTeam"
        :disabled="!canMoveToTeam"
      >
        <SwitchHorizontalIcon class="claw-context-menu__icon" />
        <span>Move to Other Team</span>
      </button>
      <div
        v-if="canMoveToTeam"
        class="claw-context-menu__submenu-menu"
        role="menu"
        aria-label="Move to team"
      >
        <button
          v-for="team in moveTargets"
          :key="team.id"
          class="claw-context-menu__action agent-context-menu__team-action"
          type="button"
          role="menuitem"
          @click="selectMoveTarget(team.id)"
        >
          <span
            class="agent-context-menu__team-dot"
            :style="{ backgroundColor: team.color ?? defaultTeamColor }"
            aria-hidden="true"
          />
          <span>{{ team.name }}</span>
        </button>
      </div>
    </div>
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
import type { Team } from '../../shared/contracts';
import { defaultTeamColor } from '../../shared/team-colors';
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
  | 'restart-agent'
  | 'save-agent-to-bench';

const props = defineProps<{
  moveTargets?: Team[];
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
const canMoveToTeam = computed(() => moveTargets.value.length > 0);
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

function selectMoveTarget(teamId: string): void {
  emit('move-agent-to-team', teamId);
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
.agent-context-menu__team-action {
  gap: var(--space-6);
}

.agent-context-menu__team-dot {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: var(--radius-full);
}
</style>
