<template>
  <div class="git-workflow-control__merge-strategy" role="radiogroup" :aria-label="label">
    <label v-for="strategy in choices" :key="strategy" :class="{ 'git-workflow-control__merge-option--selected': modelValue === strategy }">
      <input
        type="radio"
        :name="groupId"
        :value="strategy"
        :checked="modelValue === strategy"
        :aria-label="strategyLabel(strategy)"
        :aria-describedby="`${groupId}-${strategy}`"
        @change="$emit('update:modelValue', strategy)"
      />
      <component :is="icons[strategy]" class="git-workflow-control__merge-icon" aria-hidden="true" />
      <span class="git-workflow-control__merge-copy">
        <strong>{{ strategyLabel(strategy) }}</strong>
        <span :id="`${groupId}-${strategy}`">{{ strategyDescription(strategy) }}</span>
      </span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { integrationStrategies, pullStrategies, updateStrategies } from '@workspace/core/git-preferences';
import { ArrowRightIcon, ArrowsMinimizeIcon, GitBranchIcon, GitMergeIcon, SettingsIcon } from '../shared/icons/app-icons';

const props = defineProps<{ modelValue: string; kind: 'pull' | 'update' | 'integration'; label: string }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
const { t } = useI18n();
const groupId = useId();
const choices = computed(() => props.kind === 'pull' ? pullStrategies : props.kind === 'update' ? updateStrategies : integrationStrategies);
const icons = { 'git-config': SettingsIcon, merge: GitMergeIcon, rebase: GitBranchIcon, squash: ArrowsMinimizeIcon, 'rebase-ff': GitBranchIcon, 'ff-only': ArrowRightIcon };
function strategyLabel(strategy: string): string {
  if (strategy === 'merge' && props.kind === 'integration') return t('surface.gitWorkflowControl.mergeCommit');
  if (strategy === 'squash') return t('surface.gitWorkflowControl.squashAndMerge');
  return t(`gitWorkflow.strategies.${strategy === 'merge' && props.kind === 'integration' ? 'mergeCommit' : strategy}`);
}
function strategyDescription(strategy: string): string {
  if (strategy === 'merge' && props.kind === 'integration') return t('surface.gitWorkflowControl.preserveEveryCommitInAMergeCommit');
  if (strategy === 'squash') return t('surface.gitWorkflowControl.combineAllChangesIntoASingleCommit');
  return t(`gitWorkflow.descriptions.${strategy}`);
}
</script>

<style scoped>
.git-workflow-control__merge-strategy {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
  padding: var(--space-6) 0 var(--space-8);
}

.git-workflow-control__merge-strategy label {
  position: relative;
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  justify-items: center;
  gap: var(--space-4);
  min-height: 124px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-6) var(--space-8);
  color: var(--color-text-muted);
  text-align: center;
  cursor: pointer;
}

.git-workflow-control__merge-strategy label:hover,
.git-workflow-control__merge-option--selected {
  color: var(--color-text) !important;
  border-color: var(--color-primary) !important;
  background: color-mix(
    in srgb,
    var(--color-primary) 6%,
    transparent
  ) !important;
}

.git-workflow-control__merge-strategy input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.git-workflow-control__merge-strategy label:focus-within {
  border-color: var(--color-primary);
}

.git-workflow-control__merge-icon {
  width: 30px;
  height: 30px;
  color: var(--color-primary);
  stroke-width: 1.7;
}

.git-workflow-control__merge-copy {
  display: grid;
  gap: var(--space-1);
}

.git-workflow-control__merge-copy strong {
  color: var(--color-text);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
}

.git-workflow-control__merge-copy span {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  line-height: var(--line-height-18);
}
</style>
