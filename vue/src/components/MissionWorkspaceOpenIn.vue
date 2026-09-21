<template>
  <OpenInControl
    v-if="available && catalog.applications.length > 0"
    :application="effectiveOpenInApplication(agent, catalog)"
    :catalog="catalog"
    @open="emit('open', { agentId: agent.id, application: $event, path: workspacePath })"
  />
</template>

<script setup lang="ts">
import type { Agent, OpenInApplication, OpenInApplicationCatalog } from '@codex-claw/core/contracts';
import { effectiveOpenInApplication } from '../shared/open-in';
import OpenInControl from '../shared/OpenInControl.vue';

export type MissionWorkspaceOpenRequest = {
  agentId: string;
  application: OpenInApplication;
  path: string;
};

defineProps<{
  agent: Agent;
  available?: boolean;
  catalog: OpenInApplicationCatalog;
  workspacePath: string;
}>();

const emit = defineEmits<{ open: [request: MissionWorkspaceOpenRequest] }>();
</script>
