<template>
  <el-dialog
    class="claw-dialog claw-dialog--compact agent-creation-progress-dialog"
    :model-value="progress !== null"
    :teleported="false"
    width="480px"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="progress?.state === 'error'"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <StagedOperationProgress
      v-if="progress"
      :key="progress.id"
      :state="progress.state"
      :active-step="activeStep"
      :eyebrow="t('agentCreationProgress.eyebrow')"
      :title="runningTitle"
      :complete-title="t('agentCreationProgress.ready', { agent: progress.agentName ?? progress.branchName ?? progress.repositoryName })"
      :error-title="t('agentCreationProgress.failed')"
      :error-detail="progress.error"
      :steps="steps"
      @complete="emit('close', progress.id)"
    />
    <template v-if="progress?.state === 'error'" #footer>
      <div class="claw-dialog__footer">
        <button class="claw-button claw-button--tertiary" type="button" @click="emit('close', progress.id)">
          {{ t('common.close') }}
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AgentCreationProgress } from '@codex-claw/core/contracts';
import StagedOperationProgress, { type StagedOperationStep } from './StagedOperationProgress.vue';

const props = defineProps<{
  progress: AgentCreationProgress | null;
}>();

const emit = defineEmits<{
  close: [id: string];
}>();

const { t } = useI18n();
const runningTitle = computed(() => props.progress?.createWorktree
  ? t('agentCreationProgress.buildingIsolatedHome', { repository: props.progress.repositoryName })
  : t('agentCreationProgress.creatingAgent', { repository: props.progress?.repositoryName ?? '' }));
const steps = computed<StagedOperationStep[]>(() => {
  const progress = props.progress;
  if (!progress) return [];
  const creationSteps: StagedOperationStep[] = [{
    title: progress.createWorktree
      ? t('repositoryBacklog.createIsolatedWorktree')
      : t('agentCreationProgress.useRepository'),
    detail: progress.branchName ?? progress.repositoryName,
  }];
  if (progress.createWorktree) {
    creationSteps.push({
      title: t('agentCreationProgress.initializeWorktree'),
      detail: progress.initializationDetail ?? t('agentCreationProgress.checkProjectSetup'),
    });
  }
  return [
    ...creationSteps,
    {
      title: t('repositoryBacklog.startAgentSession'),
      detail: t('agentCreationProgress.newSession', {
        backend: progress.backend === 'claude' ? 'Claude' : 'Codex',
      }),
    },
    {
      title: progress.hasPrompt
        ? t('agentCreationProgress.handOverInstructions')
        : t('agentCreationProgress.finishSetup'),
      detail: progress.repositoryName,
    },
  ];
});
const activeStep = computed(() => {
  const progress = props.progress;
  if (!progress?.phase) return undefined;
  if (!progress.createWorktree) {
    return progress.phase === 'startingPrompt' ? 2 : 1;
  }
  if (progress.phase === 'initializingWorktree') return 1;
  if (progress.phase === 'creatingAgent') return 2;
  if (progress.phase === 'startingPrompt') return 3;
  return 0;
});

function onVisibilityChanged(visible: boolean): void {
  if (!visible && props.progress?.state === 'error') emit('close', props.progress.id);
}
</script>

<style scoped>
:global(.agent-creation-progress-dialog .el-dialog__header) {
  display: none;
}

.claw-dialog__footer {
  justify-content: flex-end;
}
</style>
