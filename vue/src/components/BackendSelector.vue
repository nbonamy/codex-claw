<template>
  <el-select
    v-if="choices.length > 1"
    v-model="backend"
    class="backend-selector"
    :size="size"
    :disabled="disabled"
    :aria-label="t('surface.agentDialog.codingAgent')"
  >
    <el-option
      v-for="choice in choices"
      :key="choice"
      :value="choice"
      :label="t(choice === 'codex' ? 'surface.agentDialog.codex' : 'surface.agentDialog.claudeCode')"
    />
  </el-select>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AgentBackend } from '@codex-claw/core/contracts';
import { useBackendChoices } from './backend-selection';

withDefaults(defineProps<{
  size?: 'small' | 'default' | 'large';
  disabled?: boolean;
}>(), { size: 'default', disabled: false });
const backend = defineModel<AgentBackend>({ default: 'codex' });
const choices = useBackendChoices();
const { t } = useI18n();
watch(choices, (enabled) => {
  if (!enabled.includes(backend.value) && enabled[0]) backend.value = enabled[0];
}, { immediate: true });
</script>

<style scoped>
.backend-selector { width: 160px; }
.backend-selector.el-select--small { width: 136px; }
.backend-selector.el-select--large { width: 184px; }
</style>
