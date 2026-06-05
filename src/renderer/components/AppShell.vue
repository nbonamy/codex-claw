<template>
  <main
    class="app-shell"
  >
    <TeamRail
      :teams="snapshot.teams"
      :active-team-id="activeTeam?.id ?? null"
      class="app-shell__team-rail"
    />
    <Transition name="agent-sidebar">
      <AgentSidebar
        v-if="!agentSidebarCollapsed"
        :agents="snapshot.agents"
        :active-agent-id="snapshot.activeAgentId"
        :team-name="activeTeamName"
        :width="agentSidebarWidth"
        :min-width="agentSidebarMinWidth"
        :max-width="agentSidebarMaxWidth"
        @collapse-sidebar="agentSidebarCollapsed = true"
        @resize-sidebar="setAgentSidebarWidth"
        @select-agent="$emit('select-agent', $event)"
      />
    </Transition>
    <section class="app-shell__agent">
      <AgentHeader
        :agent="activeAgent"
        :app-server="snapshot.appServer"
        :is-loading="isLoading"
        :sidebar-collapsed="agentSidebarCollapsed"
        @expand-sidebar="agentSidebarCollapsed = false"
      />
      <div class="app-shell__body">
        <ConversationPane
          :messages="messages"
          :agent="activeAgent"
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
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Agent, AppSnapshot, ClientRequestResponse, CodexModelOption, ReasoningEffort, RendererMessage, Team } from '../../shared/contracts';
import AgentHeader from './AgentHeader.vue';
import AgentSidebar from './AgentSidebar.vue';
import ConversationPane from './ConversationPane.vue';
import TeamRail from './TeamRail.vue';

const props = defineProps<{
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
}>();

defineEmits<{
  'client-response': [response: ClientRequestResponse];
  'select-agent': [agentId: string];
  'select-model': [modelId: string];
  'select-reasoning-effort': [reasoningEffort: ReasoningEffort];
  sendPrompt: [prompt: string];
}>();

const agentSidebarCollapsed = ref(false);
const agentSidebarMinWidth = 72;
const agentSidebarMaxWidth = 420;
const agentSidebarWidth = ref(260);

function setAgentSidebarWidth(width: number): void {
  agentSidebarWidth.value = Math.min(Math.max(width, agentSidebarMinWidth), agentSidebarMaxWidth);
}

const activeTeam = computed<Team | null>(() => {
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
