import type { CodexAuthentication, CodexClawApi } from '@codex-claw/core/contracts';
import { computed, onScopeDispose, ref } from 'vue';
import { translate } from '../i18n';
import {
  clearFirstRunOnboardingStage,
  getFirstRunOnboardingStage,
  setFirstRunOnboardingStage,
} from '../onboarding-session';

type FirstRunOnboardingOptions = {
  getApi: () => CodexClawApi | undefined;
  isGitHubConnected: () => boolean;
};

export function useFirstRunOnboarding(options: FirstRunOnboardingOptions) {
  const authentication = ref<CodexAuthentication | null>(null);
  const authenticationLoading = ref(true);
  const authenticationCancelling = ref(false);
  const authenticationError = ref<string | null>(null);
  const githubVisible = ref(false);
  const completeVisible = ref(false);
  let offerGitHubAfterChatGptLogin = false;
  let authenticationPoll: ReturnType<typeof setInterval> | null = null;

  const initialAuthenticationLoading = computed(() => authentication.value === null && authenticationLoading.value);
  const showLogin = computed(() => (
    initialAuthenticationLoading.value ||
    (authentication.value?.account === null && authentication.value.requiresOpenaiAuth)
  ));
  const gated = computed(() => showLogin.value || githubVisible.value || completeVisible.value);

  async function load(): Promise<void> {
    authenticationLoading.value = true;
    authenticationError.value = null;
    try {
      const api = options.getApi();
      if (!api) {
        authentication.value = {
          account: { type: 'apiKey' },
          requiresOpenaiAuth: false,
          login: { status: 'idle', error: null },
        };
        return;
      }
      authentication.value = await api.getCodexAuthentication();
      offerGitHubAfterChatGptLogin = (
        authentication.value.account === null && authentication.value.requiresOpenaiAuth
      );
      if (offerGitHubAfterChatGptLogin) {
        setFirstRunOnboardingStage('github');
      } else if (authentication.value.account) {
        restore();
      }
    } catch (error) {
      authenticationError.value = errorMessage(error);
    } finally {
      authenticationLoading.value = false;
    }
  }

  async function startChatGptLogin(): Promise<void> {
    authenticationLoading.value = true;
    authenticationError.value = null;
    try {
      const api = requireApi();
      setFirstRunOnboardingStage('github');
      await api.startCodexChatGptLogin();
      authentication.value = {
        account: null,
        requiresOpenaiAuth: true,
        login: { status: 'pending', error: null },
      };
      startPolling();
    } catch (error) {
      authenticationError.value = errorMessage(error);
    } finally {
      authenticationLoading.value = false;
    }
  }

  async function cancelChatGptLogin(): Promise<void> {
    authenticationCancelling.value = true;
    authenticationError.value = null;
    stopPolling();
    try {
      authentication.value = await requireApi().cancelCodexChatGptLogin();
    } catch (error) {
      authenticationError.value = errorMessage(error);
    } finally {
      authenticationCancelling.value = false;
    }
  }

  async function logout(): Promise<void> {
    authenticationError.value = null;
    authentication.value = await requireApi().logoutCodex();
    offerGitHubAfterChatGptLogin = false;
    githubVisible.value = false;
    completeVisible.value = false;
    clearFirstRunOnboardingStage();
  }

  function completeGitHub(): void {
    githubVisible.value = false;
    completeVisible.value = true;
    setFirstRunOnboardingStage('complete');
  }

  function finish(): void {
    completeVisible.value = false;
    clearFirstRunOnboardingStage();
  }

  function restore(): void {
    const stage = getFirstRunOnboardingStage();
    if (!stage) return;
    if (stage === 'complete' || options.isGitHubConnected()) {
      completeGitHub();
      return;
    }
    githubVisible.value = true;
    completeVisible.value = false;
  }

  function startPolling(): void {
    stopPolling();
    const api = options.getApi();
    if (!api) return;
    authenticationPoll = setInterval(() => {
      void api.getCodexAuthentication().then((next) => {
        authentication.value = next;
        if (next.account) {
          if (offerGitHubAfterChatGptLogin && !getFirstRunOnboardingStage()) {
            setFirstRunOnboardingStage('github');
          }
          restore();
          offerGitHubAfterChatGptLogin = false;
          stopPolling();
        } else if (next.login.status === 'error') {
          stopPolling();
        }
      }).catch((error) => {
        authenticationError.value = errorMessage(error);
        stopPolling();
      });
    }, 1_000);
  }

  function stopPolling(): void {
    if (authenticationPoll) clearInterval(authenticationPoll);
    authenticationPoll = null;
  }

  function requireApi(): CodexClawApi {
    const api = options.getApi();
    if (!api) throw new Error(translate('surface.appShell.codexClawAPIIsUnavailable'));
    return api;
  }

  onScopeDispose(stopPolling);

  return {
    authentication,
    authenticationCancelling,
    authenticationError,
    authenticationLoading,
    completeVisible,
    gated,
    githubVisible,
    initialAuthenticationLoading,
    showLogin,
    cancelChatGptLogin,
    completeGitHub,
    finish,
    load,
    logout,
    startChatGptLogin,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
