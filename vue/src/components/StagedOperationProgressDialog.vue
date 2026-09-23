<template>
  <el-dialog
    class="claw-dialog claw-dialog--compact staged-operation-progress-dialog"
    :model-value="visible"
    :teleported="false"
    width="480px"
    :show-close="false"
    :close-on-click-modal="false"
    :close-on-press-escape="state === 'error'"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <StagedOperationProgress
      v-if="visible"
      :key="progressKey"
      :state="state"
      :active-step="activeStep"
      :eyebrow="eyebrow"
      :title="title"
      :complete-title="completeTitle"
      :error-title="errorTitle"
      :error-detail="errorDetail"
      :steps="steps"
      @complete="emit('complete')"
    />
    <template v-if="state === 'error'" #footer>
      <div class="claw-dialog__footer">
        <button class="claw-button claw-button--tertiary" type="button" @click="emit('close')">
          {{ t('common.close') }}
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import StagedOperationProgress, { type StagedOperationStep } from './StagedOperationProgress.vue';

const props = defineProps<{
  activeStep?: number;
  completeTitle: string;
  errorDetail?: string;
  errorTitle?: string;
  eyebrow: string;
  progressKey?: string;
  state: 'running' | 'success' | 'error';
  steps: StagedOperationStep[];
  title: string;
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
  complete: [];
}>();
const { t } = useI18n();

function onVisibilityChanged(visible: boolean): void {
  if (!visible && props.state === 'error') emit('close');
}
</script>

<style scoped>
:global(.staged-operation-progress-dialog .el-dialog__header) {
  display: none;
}

.claw-dialog__footer {
  justify-content: flex-end;
}
</style>
