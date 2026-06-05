<template>
  <main
    class="app-shell"
  >
    <TeamRail
      :teams="snapshot.teams"
      :active-team-id="activeTeam?.id ?? null"
      class="app-shell__team-rail"
    />
    <AgentSidebar
      v-if="!agentSidebarCollapsed"
      :agents="snapshot.agents"
      :active-agent-id="snapshot.activeAgentId"
      :team-name="activeTeamName"
      @collapse-sidebar="agentSidebarCollapsed = true"
      @select-agent="$emit('select-agent', $event)"
    />
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
          @client-response="$emit('client-response', $event)"
          @send-prompt="$emit('sendPrompt', $event)"
        />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Agent, AppSnapshot, ClientRequestResponse, RendererMessage, Team } from '../../shared/contracts';
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
}>();

defineEmits<{
  'client-response': [response: ClientRequestResponse];
  'select-agent': [agentId: string];
  sendPrompt: [prompt: string];
}>();

const agentSidebarCollapsed = ref(false);
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
  color: var(--cc-text);
  background: var(--cc-bg);
}

.app-shell__team-rail {
  padding-top: var(--cc-space-6);
}

.app-shell__agent {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cc-workspace);
}

.app-shell__body {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
</style>
