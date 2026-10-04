<template>
  <div class="backlog-source-selector">
    <el-select :model-value="provider" :aria-label="$t('backlogSource.provider')" @update:model-value="emit('select-provider', $event)">
      <el-option :label="$t('surface.cockpitWorkInbox.gitHub')" value="github" />
      <el-option :label="$t('linearIntegration.name')" value="linear" />
    </el-select>
    <el-select v-if="showSource" :model-value="sourceId" filterable clearable :aria-label="$t(provider === 'linear' ? 'backlogSource.teamProject' : 'backlogSource.repository')" :placeholder="$t(provider === 'linear' ? 'backlogSource.teamProject' : 'backlogSource.repository')" @update:model-value="emit('select-source', $event || null)">
      <el-option v-for="source in sources" :key="source.id" :label="source.fullName" :value="source.id" />
    </el-select>
  </div>
</template>
<script setup lang="ts">
import type { WorkProviderKind, WorkRepository } from '@codex-claw/core/contracts';
withDefaults(defineProps<{ provider: WorkProviderKind; sources?: WorkRepository[]; sourceId?: string | null; showSource?: boolean }>(), { sources: () => [], sourceId: null, showSource: true });
const emit = defineEmits<{ 'select-provider': [provider: WorkProviderKind]; 'select-source': [id: string | null] }>();
</script>
<style scoped>
.backlog-source-selector {
  display: flex;
  gap: var(--space-4);
  min-width: 0;
}

.backlog-source-selector > :first-child {
  width: 110px;
  flex: 0 0 110px;
}

.backlog-source-selector > :nth-child(2) {
  flex: 1;
  min-width: 0;
}
</style>
