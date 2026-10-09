<template>
  <el-select :model-value="modelValue || 'inherit'" :aria-label="label" @update:model-value="$emit('update:modelValue', $event === 'inherit' ? '' : $event)">
    <el-option v-if="inherit" value="inherit" :label="$t('gitWorkflow.inherit', { strategy: strategyLabel(inherit) })" />
    <el-option v-for="strategy in choices" :key="strategy" :value="strategy" :label="strategyLabel(strategy)" />
  </el-select>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { pullStrategies, updateStrategies, integrationStrategies } from '@workspace/core/git-preferences';
const props = defineProps<{ modelValue: string; kind: 'pull' | 'update' | 'integration'; label: string; inherit?: string }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
const { t } = useI18n();
const choices = computed(() => props.kind === 'pull' ? pullStrategies : props.kind === 'update' ? updateStrategies : integrationStrategies);
function strategyLabel(value: string): string { return t(`gitWorkflow.strategies.${value === 'merge' && props.kind === 'integration' ? 'mergeCommit' : value}`); }
</script>
