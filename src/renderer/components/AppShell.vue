<template>
  <main
    class="app-shell"
  >
    <TeamRail
      :teams="snapshot.teams"
      :active-team-id="activeTeam?.id ?? null"
      class="app-shell__team-rail"
      @new-team="openNewTeam"
      @select-team="$emit('select-team', $event)"
    />
    <Transition name="agent-sidebar">
      <AgentSidebar
        v-if="!agentSidebarCollapsed"
        :agents="activeTeamAgents"
        :active-agent-id="currentAgent?.id ?? null"
        :team-name="activeTeamName"
        :width="agentSidebarWidth"
        :min-width="agentSidebarMinWidth"
        :max-width="agentSidebarMaxWidth"
        @collapse-sidebar="agentSidebarCollapsed = true"
        @close-agent="$emit('close-agent', $event)"
        @duplicate-agent="$emit('duplicate-agent', $event)"
        @edit-agent="openEditAgent"
        @move-agent-to-team="$emit('move-agent-to-team', $event)"
        @new-agent="openNewAgent"
        @restart-agent="$emit('restart-agent', $event)"
        @resize-sidebar="setAgentSidebarWidth"
        @save-agent-to-bench="$emit('save-agent-to-bench', $event)"
        @select-agent="$emit('select-agent', $event)"
      />
    </Transition>
    <section class="app-shell__agent">
      <AgentHeader
        v-if="!isAgentEmpty && currentAgent"
        :agent="currentAgent"
        :app-server="snapshot.appServer"
        :is-loading="isLoading"
        :sidebar-collapsed="agentSidebarCollapsed"
        @expand-sidebar="agentSidebarCollapsed = false"
      />
      <div class="app-shell__body">
        <AgentEmptyState
          v-if="isAgentEmpty"
          @new-agent="openNewAgent"
        />
        <ConversationPane
          v-else
          :messages="messages"
          :agent="currentAgent"
          :is-loading="isLoading"
          :is-sending="isSending"
          :answered-client-request-ids="answeredClientRequestIds"
          :codex-models="codexModels"
          :model-catalog-status="modelCatalogStatus"
          :selected-model-id="selectedModelId"
          :selected-reasoning-effort="selectedReasoningEffort"
          @client-response="$emit('client-response', $event)"
          @select-model="$emit('select-model', $event)"
          @select-reasoning-effort="$emit('select-reasoning-effort', $event)"
          @send-prompt="$emit('sendPrompt', $event)"
        />
      </div>
    </section>
    <AgentDialog
      :visible="agentDialogVisible"
      :mode="agentDialogMode"
      :agent="editingAgent"
      :choose-agent-folder="chooseAgentFolder"
      :create-agent="createAgent"
      :update-agent="updateAgent"
      @close="closeAgentDialog"
    />
    <TeamDialog
      :visible="teamDialogVisible"
      :create-team="createTeam"
      @close="teamDialogVisible = false"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Agent, AppSnapshot, ClientRequestResponse, CodexModelOption, CreateAgentInput, CreateTeamInput, ReasoningEffort, RendererMessage, Team, UpdateAgentInput } from '../../shared/contracts';
import AgentDialog from './AgentDialog.vue';
import AgentEmptyState from './AgentEmptyState.vue';
import AgentHeader from './AgentHeader.vue';
import AgentSidebar from './AgentSidebar.vue';
import ConversationPane from './ConversationPane.vue';
import TeamDialog from './TeamDialog.vue';
import TeamRail from './TeamRail.vue';

const props = withDefaults(defineProps<{
  snapshot: AppSnapshot;
  activeAgent: Agent | null;
  messages: RendererMessage[];
  isLoading: boolean;
  isSending: boolean;
  answeredClientRequestIds?: Set<string>;
  codexModels?: CodexModelOption[];
  modelCatalogStatus?: 'notLoaded' | 'loading' | 'loaded' | 'error';
  selectedModelId?: string | null;
  selectedReasoningEffort?: ReasoningEffort | null;
  chooseAgentFolder?: () => Promise<string | null>;
  createAgent?: (input: CreateAgentInput) => Promise<void>;
  createTeam?: (input: CreateTeamInput) => Promise<void>;
  updateAgent?: (input: UpdateAgentInput) => Promise<void>;
}>(), {
  answeredClientRequestIds: () => new Set<string>(),
  codexModels: () => [],
  modelCatalogStatus: 'notLoaded',
  selectedModelId: null,
  selectedReasoningEffort: null,
  chooseAgentFolder: async () => null,
  createAgent: async () => undefined,
  createTeam: async () => undefined,
  updateAgent: async () => undefined,
});

defineEmits<{
  'close-agent': [agentId: string];
  'client-response': [response: ClientRequestResponse];
  'duplicate-agent': [agentId: string];
  'move-agent-to-team': [agentId: string];
  'restart-agent': [agentId: string];
  'save-agent-to-bench': [agentId: string];
  'select-agent': [agentId: string];
  'select-model': [modelId: string];
  'select-reasoning-effort': [reasoningEffort: ReasoningEffort];
  'select-team': [teamId: string];
  sendPrompt: [prompt: string];
}>();

const agentSidebarCollapsed = ref(false);
const agentSidebarMinWidth = 72;
const agentSidebarMaxWidth = 420;
const agentSidebarWidth = ref(260);
const agentDialogVisible = ref(false);
const agentDialogMode = ref<'create' | 'edit'>('create');
const editingAgentId = ref<string | null>(null);
const teamDialogVisible = ref(false);
const activeTeamAgents = computed(() => {
  const team = activeTeam.value;
  if (!team) {
    return [];
  }

  return team.agentIds
    .map((agentId) => props.snapshot.agents.find((agent) => agent.id === agentId))
    .filter((agent): agent is Agent => Boolean(agent));
});
const currentAgent = computed(() => {
  const team = activeTeam.value;
  if (!team) {
    return null;
  }

  if (props.activeAgent && team.agentIds.includes(props.activeAgent.id)) {
    return props.activeAgent;
  }

  return activeTeamAgents.value.find((agent) => agent.id === team.activeAgentId) ?? activeTeamAgents.value[0] ?? null;
});
const isAgentEmpty = computed(() => activeTeamAgents.value.length === 0);
const editingAgent = computed(() => (
  editingAgentId.value ? props.snapshot.agents.find((agent) => agent.id === editingAgentId.value) ?? null : null
));

function setAgentSidebarWidth(width: number): void {
  agentSidebarWidth.value = Math.min(Math.max(width, agentSidebarMinWidth), agentSidebarMaxWidth);
}

function openNewAgent(): void {
  agentDialogMode.value = 'create';
  editingAgentId.value = null;
  agentDialogVisible.value = true;
}

function openNewTeam(): void {
  teamDialogVisible.value = true;
}

function openEditAgent(agentId: string): void {
  agentDialogMode.value = 'edit';
  editingAgentId.value = agentId;
  agentDialogVisible.value = true;
}

function closeAgentDialog(): void {
  agentDialogVisible.value = false;
}

const activeTeam = computed<Team | null>(() => {
  const selectedTeam = props.snapshot.activeTeamId
    ? props.snapshot.teams.find((team) => team.id === props.snapshot.activeTeamId) ?? null
    : null;
  if (selectedTeam) {
    return selectedTeam;
  }

  if (props.activeAgent?.teamId) {
    return props.snapshot.teams.find((team) => team.id === props.activeAgent?.teamId) ?? props.snapshot.teams[0] ?? null;
  }

  if (props.activeAgent) {
    return props.snapshot.teams.find((team) => team.agentIds.includes(props.activeAgent?.id ?? '')) ?? props.snapshot.teams[0] ?? null;
  }

  return props.snapshot.teams[0] ?? null;
});
const activeTeamName = computed(() => activeTeam.value?.name ?? 'Codex Claw');
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  color: var(--color-text);
  background: var(--color-background);
}

.app-shell__team-rail {
  padding-top: var(--space-20);
}

.app-shell > .agent-sidebar-enter-active,
.app-shell > .agent-sidebar-leave-active {
  overflow: hidden;
  transition:
    flex-basis 180ms ease,
    width 180ms ease,
    min-width 180ms ease,
    max-width 180ms ease,
    opacity 140ms ease,
    transform 180ms ease,
    border-color 180ms ease;
}

.app-shell > .agent-sidebar-enter-from,
.app-shell > .agent-sidebar-leave-to {
  flex-basis: 0;
  width: 0;
  min-width: 0;
  max-width: 0;
  opacity: 0;
  transform: translateX(-8px);
  border-right-color: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .app-shell > .agent-sidebar-enter-active,
  .app-shell > .agent-sidebar-leave-active {
    transition-duration: 1ms;
  }
}

.app-shell__agent {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface-lowest);
}

.app-shell__body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
</style>
