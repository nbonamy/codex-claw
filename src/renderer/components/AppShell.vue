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
        />
        <ArtifactPane />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import type { Agent, AppSnapshot, RendererMessage } from '../../shared/contracts';
import AgentHeader from './AgentHeader.vue';
import AgentSidebar from './AgentSidebar.vue';
import ArtifactPane from './ArtifactPane.vue';
import ConversationPane from './ConversationPane.vue';
import TeamRail from './TeamRail.vue';

defineProps<{
  snapshot: AppSnapshot;
  activeAgent: Agent | null;
  messages: RendererMessage[];
  isLoading: boolean;
}>();
</script>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: var(--cc-team-rail-width) var(--cc-agent-sidebar-width) minmax(0, 1fr);
  min-height: 100vh;
  color: var(--cc-text);
  background: var(--cc-bg);
}

.app-shell__workspace {
  min-width: 0;
  display: grid;
  grid-template-rows: var(--cc-header-height) minmax(0, 1fr);
  background: var(--cc-workspace);
}

.app-shell__body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(420px, 1fr) minmax(280px, 28vw);
}

@media (max-width: 1100px) {
  .app-shell {
    grid-template-columns: var(--cc-team-rail-width) minmax(250px, 32vw) minmax(0, 1fr);
  }

  .app-shell__body {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
