import type { AgentBackend, ClaudeAuthentication, CodexAuthentication, CodexClawApi } from '@codex-claw/core/contracts';
import type { ProviderConnection, ProviderSetupChange, ProviderSetupStatus } from '@codex-claw/core/contracts/provider-setup';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { translate } from '../i18n';
import { localizedErrorMessage } from '../i18n/errors';
import { clearFirstRunOnboardingStage, getFirstRunOnboardingStage, setFirstRunOnboardingStage } from '../onboarding-session';

type FirstRunOnboardingOptions = {
  getApi: () => CodexClawApi | undefined;
  getConnections: () => ProviderConnection[];
  hasExistingWorkspace: () => boolean;
  isGitHubConnected: () => boolean;
};

export function useFirstRunOnboarding(options: FirstRunOnboardingOptions) {
  const authentication = ref<CodexAuthentication | null>(null);
  watch(() => JSON.stringify(options.getConnections().find(provider => provider.backend === 'codex')?.authentication), () => {
    const cached = options.getConnections().find(provider => provider.backend === 'codex')?.authentication;
    if (cached?.kind === 'codex') authentication.value = cached.state;
  }, { immediate: true });
  const authenticationLoading = ref(!options.hasExistingWorkspace());
  const authenticationCancelling = ref(false);
  const authenticationError = ref<string | null>(null);
  const claudeAuthentication = ref<ClaudeAuthentication | null>(null);
  const claudeLoading = ref(false);
  const claudeError = ref<string | null>(null);
  const claudeDialogVisible = ref(false);
  const providersVisible = ref(false);
  const continuing = ref(false);
  const githubVisible = ref(false);
  const completeVisible = ref(false);
  const discovering = ref(!options.hasExistingWorkspace());
  const providerSetup = ref<ProviderSetupStatus[]>([]);
  const customizingProvider = ref<AgentBackend | null>(null);
  const updatingProvider = ref<AgentBackend | null>(null);
  const setupBusy = computed(() => updatingProvider.value !== null);
  const setupError = ref<string | null>(null);
  const customizedSetup = computed(() => providerSetup.value.find(setup => setup.backend === customizingProvider.value) ?? null);
  let disposed = false;
  let authenticationPoll: ReturnType<typeof setTimeout> | null = null;
  let pollRevision = 0;

  const codexConnected = computed(() => options.getConnections().some(provider => provider.backend === 'codex' && provider.connected));
  const claudeConnected = computed(() => options.getConnections().some(provider => provider.backend === 'claude' && provider.connected));
  const canContinue = computed(() => options.getConnections().some(provider => provider.connected && provider.installed && provider.enabled !== false));
  const initialAuthenticationLoading = computed(() => discovering.value);
  const showLogin = computed(() => discovering.value || providersVisible.value);
  const gated = computed(() => showLogin.value || githubVisible.value || completeVisible.value);

  async function load(): Promise<void> {
    if (!options.getApi()) {
      discovering.value = false;
      authenticationLoading.value = false;
      return;
    }
    try { providerSetup.value = await requireApi().getProviderSetup(); }
    catch (error) { setupError.value = errorMessage(error); }
    await refreshConnections();
    if (disposed) return;
    discovering.value = false;
    authenticationLoading.value = false;
    if (!canContinue.value || getFirstRunOnboardingStage() === 'providers'
      || (!getFirstRunOnboardingStage() && !options.hasExistingWorkspace())) {
      providersVisible.value = true;
      setFirstRunOnboardingStage('providers');
    } else {
      restore();
    }
    if (authentication.value?.login.status === 'pending') startPolling();
  }

  async function refreshCodex(): Promise<void> {
    try {
      const next = await requireApi().getCodexAuthentication();
      if (!disposed) authentication.value = next;
    } catch (error) {
      if (!disposed) authenticationError.value = errorMessage(error);
    }
  }

  async function refreshConnections(): Promise<void> {
    try { await requireApi().getProviderConnections(); }
    catch (error) { if (!disposed) setupError.value = errorMessage(error); }
  }

  async function startChatGptLogin(): Promise<void> {
    if (!isInstalled('codex')) { customizeProvider('codex'); return; }
    if (codexConnected.value) { await enableConnectedEngine('codex'); return; }
    authenticationLoading.value = true;
    authenticationError.value = null;
    try {
      await requireApi().startCodexChatGptLogin();
      if (disposed) return;
      authentication.value = { account: null, requiresOpenaiAuth: true, login: { status: 'pending', error: null } };
      startPolling();
    } catch (error) {
      if (!disposed) authenticationError.value = errorMessage(error);
    } finally {
      if (!disposed) authenticationLoading.value = false;
    }
  }

  async function refreshClaude(): Promise<void> {
    claudeLoading.value = true;
    claudeError.value = null;
    try {
      const next = await requireApi().getClaudeAuthentication();
      if (disposed) return;
      claudeAuthentication.value = next;
      if (next.loggedIn) claudeDialogVisible.value = false;
    } catch (error) {
      if (!disposed) {
        claudeAuthentication.value = null;
        claudeError.value = errorMessage(error);
      }
    } finally {
      if (!disposed) claudeLoading.value = false;
    }
  }

  async function connectClaude(): Promise<void> {
    if (!isInstalled('claude')) { customizeProvider('claude'); return; }
    if (claudeConnected.value) { await enableConnectedEngine('claude'); return; }
    claudeDialogVisible.value = true;
    await refreshClaude();
  }

  async function enableConnectedEngine(backend: AgentBackend): Promise<void> {
    const busy = backend === 'codex' ? authenticationLoading : claudeLoading;
    const error = backend === 'codex' ? authenticationError : claudeError;
    busy.value = true;
    error.value = null;
    try { await requireApi().setProviderEnabled(backend, true); }
    catch (cause) { if (!disposed) error.value = errorMessage(cause); }
    finally { if (!disposed) busy.value = false; }
  }

  async function disconnectProvider(backend: AgentBackend): Promise<void> {
    const busy = backend === 'codex' ? authenticationLoading : claudeLoading;
    const error = backend === 'codex' ? authenticationError : claudeError;
    busy.value = true;
    error.value = null;
    try {
      const result = await requireApi().disconnectProvider(backend);
      if (disposed) return;
      if (result.kind === 'codex') {
        stopPolling();
        authentication.value = result.state;
      } else {
        claudeAuthentication.value = result.state;
        claudeDialogVisible.value = false;
      }
    } catch (cause) {
      if (!disposed) error.value = errorMessage(cause);
    } finally { if (!disposed) busy.value = false; }
  }

  function isInstalled(backend: AgentBackend): boolean {
    return providerSetup.value.some(setup => setup.backend === backend && setup.installed);
  }

  async function customizeProvider(backend: AgentBackend): Promise<void> {
    setupError.value = null;
    try { providerSetup.value = await requireApi().getProviderSetup(); }
    catch (error) { setupError.value = errorMessage(error); return; }
    if (disposed) return;
    customizingProvider.value = backend;
  }

  async function saveProviderSetup(choice: ProviderSetupChange): Promise<void> {
    const backend = customizingProvider.value;
    if (!backend || setupBusy.value) return;
    updatingProvider.value = backend;
    setupError.value = null;
    try {
      if (backend === 'codex') {
        stopPolling();
        if (authentication.value?.login.status === 'pending') await requireApi().cancelCodexChatGptLogin();
      }
      const current = providerSetup.value.find(setup => setup.backend === backend);
      const unchangedLockedSetup = current?.locked && !choice.removeAgentIds
        && current.isolated === choice.isolated && current.shareSkills === choice.shareSkills;
      let next = unchangedLockedSetup ? current : await requireApi().configureProviderSetup(backend, choice);
      if (backend === 'codex') authentication.value = null;
      else claudeAuthentication.value = null;
      providerSetup.value = providerSetup.value.map(setup => setup.backend === backend ? next : setup);
      if (!next.installed) {
        next = await requireApi().installProvider(backend);
        providerSetup.value = providerSetup.value.map(setup => setup.backend === backend ? next : setup);
      }
      customizingProvider.value = null;
      if (backend === 'codex') await refreshCodex();
      else await refreshClaude();
    } catch (error) {
      setupError.value = errorMessage(error);
    } finally { updatingProvider.value = null; }
  }

  async function continueWithProviders(): Promise<void> {
    if (!canContinue.value || continuing.value) return;
    const returningToWorkspace = options.hasExistingWorkspace();
    continuing.value = true;
    authenticationError.value = null;
    try {
      if (authentication.value?.login.status === 'pending') {
        await cancelChatGptLogin();
        if (authenticationError.value) return;
      }
      await requireApi().updateSettings({ general: { providerOnboardingComplete: true } });
      if (disposed) return;
      stopPolling();
      providersVisible.value = false;
      if (returningToWorkspace) {
        clearFirstRunOnboardingStage();
        githubVisible.value = false;
        completeVisible.value = false;
        return;
      }
      setFirstRunOnboardingStage('github');
      restore();
    } catch (error) {
      if (!disposed) authenticationError.value = errorMessage(error);
    } finally {
      if (!disposed) continuing.value = false;
    }
  }

  async function cancelChatGptLogin(): Promise<void> {
    authenticationCancelling.value = true;
    authenticationError.value = null;
    stopPolling();
    try {
      const next = await requireApi().cancelCodexChatGptLogin();
      if (!disposed) authentication.value = next;
    } catch (error) {
      if (!disposed) authenticationError.value = errorMessage(error);
    } finally {
      if (!disposed) authenticationCancelling.value = false;
    }
  }

  async function logout(): Promise<void> {
    authenticationError.value = null;
    authentication.value = await requireApi().logoutCodex();
    githubVisible.value = false;
    completeVisible.value = false;
    providersVisible.value = !options.hasExistingWorkspace();
    if (providersVisible.value) setFirstRunOnboardingStage('providers');
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
    if (!stage || stage === 'providers') return;
    if (stage === 'complete' || options.isGitHubConnected()) {
      completeGitHub();
      return;
    }
    githubVisible.value = true;
    completeVisible.value = false;
  }

  function startPolling(): void {
    stopPolling();
    const revision = pollRevision;
    const poll = async () => {
      try {
        const next = await requireApi().getCodexAuthentication();
        if (disposed || revision !== pollRevision) return;
        authentication.value = next;
        if (next.account || next.login.status === 'error' || next.login.status === 'cancelled') return;
        authenticationPoll = setTimeout(() => { void poll(); }, 1_000);
      } catch (error) {
        if (!disposed && revision === pollRevision) authenticationError.value = errorMessage(error);
      }
    };
    authenticationPoll = setTimeout(() => { void poll(); }, 1_000);
  }

  function stopPolling(): void {
    ++pollRevision;
    if (authenticationPoll) clearTimeout(authenticationPoll);
    authenticationPoll = null;
  }

  function requireApi(): CodexClawApi {
    const api = options.getApi();
    if (!api) throw new Error(translate('surface.appShell.codexClawAPIIsUnavailable'));
    return api;
  }

  onScopeDispose(() => { disposed = true; stopPolling(); });

  return {
    authentication, authenticationCancelling, authenticationError, authenticationLoading,
    claudeAuthentication, claudeLoading, claudeError, claudeDialogVisible,
    codexConnected, claudeConnected, canContinue, continuing,
    completeVisible, gated, githubVisible, initialAuthenticationLoading, showLogin,
    cancelChatGptLogin, completeGitHub, finish, load, logout, startChatGptLogin,
    connectClaude, disconnectProvider, refreshClaude, refreshConnections, continueWithProviders,
    providerSetup, customizingProvider, customizedSetup, setupBusy, updatingProvider, setupError, customizeProvider, saveProviderSetup,
  };
}

function errorMessage(error: unknown): string {
  return localizedErrorMessage(error, translate).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}
