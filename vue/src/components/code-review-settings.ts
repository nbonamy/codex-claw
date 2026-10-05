import { inject, type InjectionKey } from 'vue';
import type { CodeReviewPreferences } from '@workspace/core/code-review';
import type { AgentBackend, BackendModelOption } from '@workspace/core/contracts';
import { appApi } from '../platform-api';

type ReviewSettingsContext = {
  preferences: () => CodeReviewPreferences | undefined;
  listModels: (agentId: string, backend: AgentBackend) => Promise<BackendModelOption[]>;
  stop: (agentId: string, sessionId: string) => Promise<unknown>;
};

export const codeReviewSettingsKey: InjectionKey<ReviewSettingsContext> = Symbol('codeReviewSettings');

export function useCodeReviewSettings(): ReviewSettingsContext {
  return inject(codeReviewSettingsKey, {
    preferences: () => undefined,
    listModels: async (agentId, backend) => await appApi?.listBackendModels(agentId, backend) ?? [],
    stop: async (agentId, sessionId) => {
      if (!appApi) throw new Error('Backend connection is unavailable.');
      // Disable the loop before interrupting the provider, including between turns.
      await appApi.discardCodeReview(agentId, sessionId);
      await appApi.interruptAgent(agentId);
    },
  });
}
