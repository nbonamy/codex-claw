<template>
  <details v-if="tasks.length || error" class="agent-tasks">
    <summary>{{ t('tasks.title') }} <span v-if="tasks.length">({{ tasks.length }})</span></summary>
    <p v-if="error" role="alert">{{ error }}</p>
    <details v-for="task in tasks" :key="task.id" class="agent-tasks__item">
      <summary>{{ task.assignment.title }} · {{ task.state }}</summary>
      <p>{{ task.assignment.doneWhen }}</p>
      <details><summary>{{ t('tasks.assignment') }}</summary><p>{{ task.prompt }}</p></details>
      <p v-if="task.detail">{{ task.detail }}</p>
      <p class="agent-tasks__reference">{{ task.id }} · {{ task.backend }} · {{ task.folder }}</p>
      <template v-if="task.submission">
        <p v-if="task.state !== 'completed'">{{ t('tasks.provisional') }}</p>
        <p>{{ task.submission.summary }}</p>
        <strong>{{ t('tasks.evidence') }}</strong>
        <ul><li v-for="entry in task.submission.evidence" :key="entry">{{ entry }}</li></ul>
        <strong>{{ t('tasks.artifacts') }}</strong>
        <ul><li v-for="entry in task.submission.artifacts" :key="entry">{{ entry }}</li></ul>
        <strong>{{ t('tasks.caveats') }}</strong>
        <ul><li v-for="entry in task.submission.caveats" :key="entry">{{ entry }}</li></ul>
      </template>
      <p v-if="task.delivery">{{ t('tasks.delivery') }}: {{ task.delivery.state }}</p>
      <button v-if="!['completed', 'failed', 'cancelled'].includes(task.state)" type="button" class="claw-button" @click="emit('cancel', task.id)">{{ t('tasks.cancel') }}</button>
    </details>
  </details>
</template>
<script setup lang="ts">
import type { DelegatedTask } from '@codex-claw/core/delegated-task';
import { useI18n } from 'vue-i18n';
defineProps<{ tasks: DelegatedTask[]; error: string }>();
const emit = defineEmits<{ cancel: [taskId: string] }>();
const { t } = useI18n();
</script>
<style scoped>
.agent-tasks {
  flex: 0 0 auto;
  max-height: 35vh;
  overflow: auto;
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  font-size: var(--font-size-13);
}
.agent-tasks summary { cursor: pointer; }
.agent-tasks__item { padding: 8px 0; }
.agent-tasks p { white-space: pre-wrap; overflow-wrap: anywhere; }
.agent-tasks__reference { color: var(--color-text-muted); }
</style>
