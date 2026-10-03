<template>
  <SettingsSection>
    <SettingsRow :title="title ?? $t('engineConnection.title')" :error="error">
      <template #control>
        <button v-if="pending" class="claw-button claw-button--tertiary" type="button" aria-busy="true" :disabled="busy" @click="emit('cancel')">{{ $t('auth.cancel') }}</button>
        <el-button v-else-if="connected && enabled !== false" :title="$t('engineConnection.preserveLogin')" :disabled="busy || saving" @click="toggle(false)">{{ $t('engineConnection.disconnect') }}</el-button>
        <el-button v-else :disabled="busy || saving" @click="emit('connect')">
          {{ $t('engineConnection.connect') }}
        </el-button>
      </template>
      <template #copy>
        <span v-if="accountLabel">{{ accountLabel }}</span>
        <span v-if="busy && !pending" role="status">{{ $t('auth.checking') }}</span>
        <span v-else-if="!pending">{{ $t(connected && enabled !== false ? 'engineConnection.connected' : 'engineConnection.disconnected') }}</span>
      </template>
    </SettingsRow>
    <slot />
    <SettingsRow :title="$t('engineConnection.enabled')">
      <template #control>
        <el-switch :model-value="connected && enabled !== false" :loading="saving" :disabled="!connected || busy || saving || pending" :aria-label="$t('engineConnection.enabled')" @update:model-value="toggle" />
      </template>
    </SettingsRow>
  </SettingsSection>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ProviderAuthentication } from '@codex-claw/core/contracts/provider-setup';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';
const props = withDefaults(defineProps<{ title?: string; connected?: boolean; enabled?: boolean; busy?: boolean; pending?: boolean; error?: string | null; authentication?: ProviderAuthentication; setEnabled?: (enabled: boolean) => unknown }>(), { enabled: true });
const emit = defineEmits<{ connect: []; cancel: [] }>();
const { t } = useI18n();
const saving = ref(false);
const accountLabel = computed(() => {
  const auth = props.authentication;
  if (!auth) return '';
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
