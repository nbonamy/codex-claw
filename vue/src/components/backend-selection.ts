import { computed, inject, provide, ref, type ComputedRef, type InjectionKey } from 'vue';
import { enabledAgentBackends } from '@codex-claw/core/agent-backends';
import type { AgentBackend, AppGeneralSettings } from '@codex-claw/core/contracts';

export const backendChoicesKey: InjectionKey<ComputedRef<AgentBackend[]>> = Symbol('backendChoices');
type BackendSwitch = ReturnType<typeof provideBackendSwitch>;
const backendSwitchKey: InjectionKey<BackendSwitch> = Symbol('backendSwitch');

export function provideBackendSwitch(update: (id: string, backend: AgentBackend) => Promise<void>) {
  const busy = ref(false);
  let pending: Promise<void> | undefined;
  const context = {
    busy,
    select(id: string, backend: AgentBackend): Promise<void> {
      if (pending) return pending;
      busy.value = true;
      pending = update(id, backend).finally(() => { busy.value = false; pending = undefined; });
      return pending;
    },
    settled: () => pending ?? Promise.resolve(),
  };
  provide(backendSwitchKey, context);
  return context;
}

export function useBackendSwitch() {
  return inject(backendSwitchKey, undefined);
}

export function provideBackendChoices(settings: () => AppGeneralSettings): void {
  provide(backendChoicesKey, computed(() => enabledAgentBackends(settings())));
}

export function useBackendChoices(): ComputedRef<AgentBackend[]> {
  return inject(backendChoicesKey, computed(() => ['codex']));
}
