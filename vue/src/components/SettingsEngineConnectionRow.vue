<template>
  <component :is="compact ? 'div' : SettingsSection" :class="{ 'settings-engine-connection--compact': compact }">
    <SettingsRow :title="title ?? $t('engineConnection.title')" :error="error">
      <template #control>
        <button v-if="pending" class="app-button app-button--tertiary" type="button" aria-busy="true" :disabled="busy" @click="emit('cancel')">{{ $t('auth.cancel') }}</button>
        <el-button v-else-if="connected" :size="compact ? 'small' : undefined" :disabled="busy || saving" @click="emit('disconnect')">{{ $t('engineConnection.disconnect') }}</el-button>
        <el-button v-else :size="compact ? 'small' : undefined" :disabled="busy || saving" @click="emit('connect')">
          {{ $t('engineConnection.connect') }}
        </el-button>
        <el-switch v-if="compact" :model-value="connected && enabled !== false" :loading="saving" :disabled="!connected || busy || saving || pending" :aria-label="`${$t('engineConnection.enabled')} · ${title ?? $t('engineConnection.title')}`" @update:model-value="toggle" />
      </template>
      <template #copy>
        <span v-if="accountLabel" :title="accountLabel">{{ accountLabel }}</span>
        <span v-if="busy && !pending" role="status">{{ $t('auth.checking') }}</span>
        <span v-else-if="!pending && (!compact || !accountLabel)">{{ $t(connected ? 'engineConnection.connected' : 'engineConnection.disconnected') }}</span>
      </template>
    </SettingsRow>
    <slot />
    <SettingsRow v-if="!compact" :title="$t('engineConnection.enabled')">
      <template #control>
        <el-switch :model-value="connected && enabled !== false" :loading="saving" :disabled="!connected || busy || saving || pending" :aria-label="$t('engineConnection.enabled')" @update:model-value="toggle" />
      </template>
    </SettingsRow>
  </component>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ProviderAuthentication } from '@workspace/core/contracts/provider-setup';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';
const props = withDefaults(defineProps<{ compact?: boolean; title?: string; connected?: boolean; enabled?: boolean; busy?: boolean; pending?: boolean; error?: string | null; authentication?: ProviderAuthentication; setEnabled?: (enabled: boolean) => unknown }>(), { enabled: true });
const emit = defineEmits<{ connect: []; disconnect: []; cancel: [] }>();
const { t } = useI18n();
const saving = ref(false);
const accountLabel = computed(() => {
  const auth = props.authentication;
  if (!auth || auth.kind === 'antigravity') return '';
  const account = auth.state.account;
  if (!account) return '';
  if (account.type === 'apiKey') return t('engineConnection.apiKey');
  if (account.type === 'chatgpt') return [account.email, account.planType].filter(Boolean).join(' · ');
  if (account.type === 'subscription') return [account.email, account.subscription ?? t('engineConnection.subscription')].filter(Boolean).join(' · ');
  return t('engineConnection.amazonBedrock');
});
async function toggle(value: string | number | boolean) {
  saving.value = true;
  try { await props.setEnabled?.(value === true); }
  catch (cause) {
    const lastEngine = String(cause).endsWith('Cannot disable the last engine. Enable another one first.');
    await ElMessageBox.alert(
      t(lastEngine ? 'engineConnection.lastEngine' : 'engineConnection.updateFailed'),
      t(lastEngine ? 'engineConnection.lastEngineTitle' : 'engineConnection.updateFailedTitle'),
      { confirmButtonText: t('common.ok'), type: lastEngine ? 'warning' : 'error' },
    ).catch(() => {});
  }
  finally { saving.value = false; }
}
</script>

<style scoped>
.settings-engine-connection--compact {
  min-width: 0;
}

.settings-engine-connection--compact :deep(.settings-row) {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-2) 0;
}

.settings-engine-connection--compact :deep(.settings-row__copy) {
  flex-direction: row;
  align-items: center;
  gap: var(--space-6);
}

.settings-engine-connection--compact :deep(.settings-row__copy strong) {
  flex: 0 0 100px;
}

.settings-engine-connection--compact :deep(.settings-row__copy span) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.settings-engine-connection--compact :deep(.settings-row__control) {
  justify-self: end;
  gap: var(--space-6);
}
</style>
