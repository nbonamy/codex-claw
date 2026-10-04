import { onUnmounted, ref, watch, type Ref } from 'vue';
import type { CodexClawApi } from '@codex-claw/core/contracts';
import type { DelegatedTask } from '@codex-claw/core/delegated-task';

export function useAgentTasks(agentId: () => string, api: () => Pick<CodexClawApi, 'listAgentTasks' | 'cancelAgentTask'> | undefined) {
  const tasks: Ref<DelegatedTask[]> = ref([]);
  const error = ref('');
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  async function refresh() {
    const current = ++generation;
    clearTimeout(timer);
    try {
      const result = agentId() ? await api()?.listAgentTasks(agentId()) ?? [] : [];
      if (current === generation && !disposed) { tasks.value = result; error.value = ''; }
    } catch (failure) {
      if (current === generation && !disposed) error.value = String(failure);
    } finally {
      if (current === generation && !disposed) timer = setTimeout(() => void refresh(), 3000);
    }
  }
  async function cancel(taskId: string) {
    try { await api()?.cancelAgentTask(agentId(), taskId); await refresh(); }
    catch (failure) { error.value = String(failure); }
  }
  watch(agentId, () => { tasks.value = []; void refresh(); }, { immediate: true });
  onUnmounted(() => { disposed = true; generation++; clearTimeout(timer); });
  return { tasks, error, refresh, cancel };
}
