<template>
  <span class="provider-install-actions">
    <a :href="url" target="_blank" rel="noopener noreferrer" @click.prevent="appPlatformActions.openExternal?.(url)">{{ $t('auth.installProvider') }}</a>
    <button type="button" :aria-label="$t('auth.checkAgain')" :title="$t('auth.checkAgain')" :disabled="busy || disabled" :aria-busy="busy || undefined" @click="emit('refresh')">
      <ElIcon :size="12" :class="{ 'is-loading': busy }" aria-hidden="true"><RefreshIcon /></ElIcon>
    </button>
    <span v-if="backend === 'antigravity'">{{ $t('antigravity.installInstructions') }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ElIcon } from 'element-plus';
import type { AgentBackend } from '@workspace/core/contracts';
import { appPlatformActions } from '../platform-api';
import { RefreshIcon } from '../shared/icons/app-icons';

const props = defineProps<{ backend: AgentBackend; busy?: boolean; disabled?: boolean }>();
const emit = defineEmits<{ refresh: [] }>();
const url = computed(() => props.backend === 'codex'
  ? 'https://learn.chatgpt.com/docs/codex/cli#getting-started'
  : props.backend === 'claude'
    ? 'https://code.claude.com/docs/en/quickstart#step-1-install-claude-code'
    : 'https://github.com/agentclientprotocol/registry/blob/dc55a34900fdd60e5e97c1cbd7825c5a1df673fc/antigravity-acp/agent.json');
</script>

<style scoped>
.provider-install-actions {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
  -webkit-app-region: no-drag;
}

.provider-install-actions a,
.provider-install-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-text-muted);
  font: inherit;
  text-decoration: none;
  cursor: pointer;
}

.provider-install-actions a:hover,
.provider-install-actions button:hover:not(:disabled) {
  color: var(--color-text);
}

.provider-install-actions button:disabled {
  cursor: default;
  opacity: 0.5;
}

@media (prefers-reduced-motion: reduce) {
  .provider-install-actions .el-icon.is-loading {
    animation: none;
  }
}
</style>
