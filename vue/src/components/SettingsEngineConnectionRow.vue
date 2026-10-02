<template>
  <SettingsSection>
    <SettingsRow :title="title ?? $t('engineConnection.title')" :error="error">
      <template #control>
        <button v-if="pending" class="claw-button claw-button--tertiary" type="button" aria-busy="true" :disabled="busy" @click="emit('cancel')">{{ $t('auth.cancel') }}</button>
        <el-switch v-else-if="connected" :model-value="enabled !== false" :loading="saving" :disabled="busy || saving" :aria-label="title ?? $t('engineConnection.enabled')" @update:model-value="toggle" />
        <el-button v-else :disabled="busy" @click="emit('connect')">
          {{ $t('engineConnection.connect') }}
        </el-button>
      </template>
      <template #copy>
        <span v-if="busy && !pending" role="status">{{ $t('auth.checking') }}</span>
      </template>
    </SettingsRow>
  </SettingsSection>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import SettingsRow from './SettingsRow.vue';
import SettingsSection from './SettingsSection.vue';
const props = withDefaults(defineProps<{ title?: string; connected?: boolean; enabled?: boolean; busy?: boolean; pending?: boolean; error?: string | null; setEnabled?: (enabled: boolean) => unknown }>(), { enabled: true });
const emit = defineEmits<{ connect: []; cancel: [] }>();
const { t } = useI18n();
const saving = ref(false);
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
