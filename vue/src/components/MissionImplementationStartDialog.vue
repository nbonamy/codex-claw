<template>
  <StagedOperationProgressDialog
      visible
      state="running"
      :eyebrow="t('missions.implementationStartEyebrow')"
      :title="t('missions.implementationStartTitle')"
      :complete-title="t('missions.implementationStartComplete')"
      :active-step="activeStep"
      :steps="steps"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { StagedOperationStep } from './StagedOperationProgress.vue';
import StagedOperationProgressDialog from './StagedOperationProgressDialog.vue';
import { missionRepositoryName } from './mission-implementation-model';
import type { MissionImplementationStartProgress } from '@codex-claw/core/mission-execution';

const props = defineProps<{
  repositories: string[];
  ticketCount: number;
  phase?: MissionImplementationStartProgress['phase'];
}>();
const { t } = useI18n();
const activeStep = computed(() => {
  if (props.phase === 'startingAgents') return 2;
  if (props.phase === 'initializingWorkspaces') return 1;
  return 0;
});
const repositoryNames = computed(() => props.repositories.map(missionRepositoryName).join(', '));
const steps = computed<StagedOperationStep[]>(() => [
  {
    title: t('missions.implementationStartWorktrees'),
    detail: t('missions.implementationStartWorktreesDetail', { count: props.repositories.length }),
  },
  {
    title: t('missions.implementationStartInitialize'),
    detail: repositoryNames.value,
  },
  {
    title: t('missions.implementationStartAgents'),
    detail: t('missions.implementationStartAgentsDetail', { count: props.ticketCount }),
  },
]);
</script>
