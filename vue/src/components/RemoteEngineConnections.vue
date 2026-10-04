<template>
  <div class="remote-engine-connections">
    <template v-for="engine in engines" :key="engine.backend">
      <button v-if="!engine.installed" class="claw-button claw-button--secondary" type="button" :disabled="busy" @click="install(engine.backend)">
        {{ $t('auth.installProvider') }} {{ backendDisplayName(engine.backend) }}
      </button>
      <template v-else>
        <SettingsEngineConnectionRow :title="backendDisplayName(engine.backend)" :authentication="engine.authentication" :connected="engine.connected" :enabled="engine.enabled" :busy="busy" :set-enabled="enabled => setEnabled(engine.backend, enabled)" @connect="connect(engine)" @disconnect="disconnect(engine.backend)" />
        <RemoteCodexAuthentication v-if="signingIn === engine.backend && engine.backend === 'codex'" :connection="connection" @connected="finishConnection" />
        <RemoteClaudeAuthentication v-if="signingIn === engine.backend && engine.backend === 'claude'" :connection="connection" @connected="finishConnection" />
      </template>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <button v-if="error" class="claw-button claw-button--tertiary" type="button" :disabled="busy" @click="refresh">{{ $t('surface.remoteClaudeAuth.retry') }}</button>
    <span v-else-if="busy">{{ $t('auth.checking') }}</span>
  </div>
</template>

<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue';
import type { AgentBackend, RemoteConnection } from '@codex-claw/core/contracts';
import type { ProviderConnection } from '@codex-claw/core/contracts/provider-setup';
import { backendDisplayName } from '@codex-claw/core/backend-driver';
import { codexClawApi } from '../platform-api';
import { translate } from '../i18n';
import RemoteCodexAuthentication from './RemoteCodexAuthentication.vue';
import RemoteClaudeAuthentication from './RemoteClaudeAuthentication.vue';
import SettingsEngineConnectionRow from './SettingsEngineConnectionRow.vue';

const props = defineProps<{ connection: RemoteConnection }>();
const engines = ref<ProviderConnection[]>([]);
const signingIn = ref<AgentBackend | null>(null);
const error = ref('');
const busy = ref(false);
let revision = 0;
async function refresh() {
  const expected = ++revision;
  busy.value = true;
  error.value = '';
  try {
    if (!codexClawApi) throw new Error('Backend connection is unavailable.');
    const result = await codexClawApi.getProviderConnections(props.connection.id);
    if (expected === revision) engines.value = result;
  } catch (cause) {
    if (expected === revision) error.value = cause instanceof Error ? cause.message : String(cause);
  } finally { if (expected === revision) busy.value = false; }
}
async function install(backend: AgentBackend) {
  busy.value = true;
  error.value = '';
  const expected = revision;
  try {
    if (!codexClawApi) throw new Error('Backend connection is unavailable.');
    await codexClawApi.installProvider(backend, props.connection.id);
    if (expected === revision) await refresh();
  } catch (cause) {
    if (expected === revision) error.value = cause instanceof Error ? cause.message : String(cause);
  } finally { if (expected === revision) busy.value = false; }
}
async function setEnabled(backend: AgentBackend, enabled: boolean) {
  if (!codexClawApi) throw new Error('Backend connection is unavailable.');
  const expected = revision;
  const result = await codexClawApi.setProviderEnabled(backend, enabled, props.connection.id);
  if (expected === revision) engines.value = result;
}
async function connect(engine: ProviderConnection) {
  if (!engine.connected) { signingIn.value = engine.backend; return; }
  busy.value = true;
  error.value = '';
  const expected = revision;
  try { await setEnabled(engine.backend, true); }
  catch { if (expected === revision) error.value = translate('engineConnection.updateFailed'); }
  finally { if (expected === revision) busy.value = false; }
}
async function disconnect(backend: AgentBackend) {
  busy.value = true;
  error.value = '';
  const expected = revision;
  try {
    if (!codexClawApi) throw new Error('Backend connection is unavailable.');
    await codexClawApi.disconnectProvider(backend, props.connection.id);
    if (expected === revision) { signingIn.value = null; await refresh(); }
  } catch {
    if (expected === revision) error.value = translate('engineConnection.disconnectFailed');
  } finally { if (expected === revision) busy.value = false; }
}
async function finishConnection() { signingIn.value = null; await refresh(); }
watch(() => props.connection.id, () => { engines.value = []; signingIn.value = null; void refresh(); }, { immediate: true });
onScopeDispose(() => { ++revision; });
</script>

<style scoped>
.remote-engine-connections { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-4); }
</style>
