<template>
  <main class="app-shell">
    <TeamRail
      :teams="snapshot.teams"
      :active-agent="activeAgent"
    />
    <AgentSidebar
      :agents="snapshot.agents"
      :active-agent-id="snapshot.activeAgentId"
      :bench-count="snapshot.bench.length"
      @select-agent="$emit('select-agent', $event)"
    />
    <section class="app-shell__workspace">
      <AgentHeader
        :agent="activeAgent"
        :app-server="snapshot.appServer"
        :is-loading="isLoading"
      />
      <div class="app-shell__body">
        <ConversationPane
          :messages="messages"
          :agent="activeAgent"
          :is-sending="isSending"
          @send-prompt="$emit('sendPrompt', $event)"
        />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import type { Agent, AppSnapshot, RendererMessage } from '../../shared/contracts';
import AgentHeader from './AgentHeader.vue';
import AgentSidebar from './AgentSidebar.vue';
import ConversationPane from './ConversationPane.vue';
import TeamRail from './TeamRail.vue';

defineProps<{
  snapshot: AppSnapshot;
  activeAgent: Agent | null;
  messages: RendererMessage[];
  isLoading: boolean;
  isSending: boolean;
}>();

defineEmits<{
  'select-agent': [agentId: string];
  sendPrompt: [prompt: string];
}>();
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: var(--cc-team-rail-width) var(--cc-agent-sidebar-width) minmax(0, 1fr);
  height: 100vh;
  min-height: 0;
  overflow: hidden;
  color: var(--cc-text);
  background: var(--cc-bg);
}

.app-shell__workspace {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: var(--cc-header-height) minmax(0, 1fr);
  overflow: hidden;
  background: var(--cc-workspace);
}

.app-shell__body {
  min-height: 0;
  display: flex;
  min-width: 0;
  overflow: hidden;
}

@media (max-width: 1100px) {
  .app-shell {
    grid-template-columns: var(--cc-team-rail-width) minmax(var(--cc-agent-sidebar-compact-min), var(--cc-agent-sidebar-compact-width)) minmax(0, 1fr);
  }

}
</style>
