<template>
  <section class="remote-codex-auth" aria-live="polite">
    <template v-if="connected">
      <span>{{ $t('surface.remoteCodexAuth.connected') }}<template v-if="email"> · {{ email }}</template></span>
    </template>
    <template v-else-if="login">
      <span>{{ $t('surface.remoteCodexAuth.instructions') }}</span>
      <div class="remote-codex-auth__code-row">
        <strong class="remote-codex-auth__code">{{ login.userCode }}</strong>
        <el-button text size="small" :icon="codeCopied ? CheckIcon : CopyIcon"
          :aria-label="$t(codeCopied ? 'surface.remoteCodexAuth.copied' : 'surface.remoteCodexAuth.copy')"
          :title="$t(codeCopied ? 'surface.remoteCodexAuth.copied' : 'surface.remoteCodexAuth.copy')"
          @click="copyCode" />
      </div>
      <span v-if="copyFailed">{{ $t('surface.remoteCodexAuth.copyFailed') }}</span>
      <div class="remote-codex-auth__actions">
        <el-button text size="small" @click="openVerification">{{ $t('surface.remoteCodexAuth.open') }}</el-button>
        <el-button text size="small" :disabled="busy" @click="cancel">{{ $t('surface.remoteCodexAuth.cancel') }}</el-button>
      </div>
    </template>
    <template v-else-if="authentication || error">
      <span v-if="!authentication" :title="error">{{ $t('surface.remoteCodexAuth.unavailable') }}</span>
      <span v-else>{{ $t('surface.remoteCodexAuth.signInRequired') }}</span>
      <button class="claw-button claw-button--secondary" type="button" :disabled="busy" :aria-busy="busy" @click="authentication ? start() : refresh()">
        {{ $t(authentication ? 'surface.remoteCodexAuth.connect' : 'surface.remoteCodexAuth.retry') }}
      </button>
    </template>
    <span v-else>{{ $t('surface.remoteCodexAuth.checking') }}</span>
    <p v-if="error && (authentication || login)" class="remote-codex-auth__error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CheckIcon, CopyIcon } from '../shared/icons/app-icons';
import type { RemoteConnection } from '@codex-claw/core/contracts';
import { useRemoteCodexAuthentication, type RemoteCodexAuthApi } from './use-remote-codex-authentication';

const props = defineProps<{ connection: RemoteConnection; api?: RemoteCodexAuthApi }>();
const state = props.api
  ? useRemoteCodexAuthentication(() => props.connection, () => props.api)
  : useRemoteCodexAuthentication(() => props.connection);
const { authentication, login, connected, busy, error, start, cancel, refresh } = state;
const codeCopied = ref(false);
const copyFailed = ref(false);
watch(() => login.value?.userCode, () => { codeCopied.value = false; copyFailed.value = false; });
async function copyCode() {
  const code = login.value?.userCode;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    if (login.value?.userCode !== code) return;
    codeCopied.value = true;
    copyFailed.value = false;
  } catch {
    if (login.value?.userCode !== code) return;
    codeCopied.value = false;
    copyFailed.value = true;
  }
}
const email = computed(() => authentication.value?.account?.type === 'chatgpt' ? authentication.value.account.email : null);
function openVerification() {
  if (login.value) window.open(login.value.verificationUrl, '_blank', 'noopener,noreferrer');
}
</script>

<style scoped>
.remote-codex-auth {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-4);
  margin-top: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.remote-codex-auth__code {
  color: var(--color-text);
  user-select: all;
}

.remote-codex-auth__actions {
  display: flex;
  align-items: center;
}

.remote-codex-auth__code-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.remote-codex-auth__error {
  margin: 0;
  color: var(--color-error);
  overflow-wrap: anywhere;
}
</style>
