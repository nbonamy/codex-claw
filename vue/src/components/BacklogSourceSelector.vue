<template>
  <div v-if="providers.length > 1 || showSource" class="backlog-source-selector" :class="{ 'backlog-source-selector--small': size === 'small', 'backlog-source-selector--full-width': fullWidth }">
    <el-select v-if="providers.length > 1" class="backlog-source-selector__provider" :size="size" :model-value="provider" :aria-label="$t('backlogSource.provider')" @update:model-value="emit('select-provider', $event)">
      <el-option v-for="option in providers" :key="option" :label="$t(option === 'github' ? 'surface.cockpitWorkInbox.gitHub' : 'linearIntegration.name')" :value="option" />
    </el-select>
    <el-select v-if="showSource" class="backlog-source-selector__source" :size="size" :model-value="sourceId" filterable clearable :aria-label="$t(provider === 'linear' ? 'backlogSource.teamProject' : 'backlogSource.repository')" :placeholder="$t(provider === 'linear' ? 'backlogSource.teamProject' : 'backlogSource.repository')" @update:model-value="emit('select-source', $event || null)">
      <el-option v-for="source in sources" :key="source.id" :label="source.fullName" :value="source.id" />
    </el-select>
  </div>
</template>
<script setup lang="ts">
import type { WorkProviderKind, WorkRepository } from '@codex-claw/core/contracts';
withDefaults(defineProps<{ provider: WorkProviderKind; providers: WorkProviderKind[]; sources?: WorkRepository[]; sourceId?: string | null; showSource?: boolean; size?: 'default' | 'small'; fullWidth?: boolean }>(), { sources: () => [], sourceId: null, showSource: true, size: 'default', fullWidth: false });
const emit = defineEmits<{ 'select-provider': [provider: WorkProviderKind]; 'select-source': [id: string | null] }>();
</script>
<style scoped>
.backlog-source-selector {
  display: flex;
  gap: var(--space-4);
  min-width: 0;
}

.backlog-source-selector__provider {
  width: 110px;
  flex: 0 0 110px;
}

.backlog-source-selector__source {
  flex: 1;
  min-width: 0;
}

.backlog-source-selector--small .backlog-source-selector__provider {
  width: 96px;
  flex-basis: 96px;
}

.backlog-source-selector--full-width .backlog-source-selector__provider {
  width: 100%;
  flex: 1;
}
</style>
