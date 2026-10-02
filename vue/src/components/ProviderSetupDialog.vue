<template>
  <FormDialog :model-value="Boolean(setup)" :title="t('auth.customizeProvider', { provider: setup?.backend === 'codex' ? 'Codex' : 'Claude Code' })" teleported @update:model-value="!$event && !busy && emit('close')">
    <div class="claw-form-dialog">
      <p v-if="setup && !setup.installed">{{ t('auth.installExplanation') }}</p>
      <FormDialogField :label="t('auth.conversations')" :help="t('auth.separateExplanation')">
        <el-radio-group v-model="isolated" class="provider-setup__choices" :disabled="busy || setup?.locked">
          <el-radio :value="true">{{ t('auth.separateChats') }}</el-radio>
          <el-checkbox v-if="isolated" v-model="shareSkills" class="provider-setup__skills" :disabled="busy || setup?.locked">{{ t('auth.shareSkills') }}</el-checkbox>
          <el-radio :value="false" class="provider-setup__existing">{{ t('auth.existingSetup') }}</el-radio>
        </el-radio-group>
      </FormDialogField>
      <p v-if="setup?.locked">{{ t('auth.setupLocked') }}</p>
      <p v-if="error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <button class="claw-button claw-button--tertiary" type="button" :disabled="busy" @click="emit('close')">{{ t('surface.remoteClaudeAuth.close') }}</button>
      <button class="claw-button claw-button--primary" type="button" :disabled="busy || (setup?.locked && setup.installed)" @click="emit('save', { isolated, shareSkills })">{{ t(busy ? 'auth.settingUp' : setup?.installed ? 'auth.saveSetup' : 'auth.installProvider') }}</button>
    </template>
  </FormDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ProviderSetupChoice, ProviderSetupStatus } from '@codex-claw/core/contracts/provider-setup';
import FormDialog from '../shared/dialog/FormDialog.vue';
import FormDialogField from '../shared/dialog/FormDialogField.vue';

const props = defineProps<{ setup: ProviderSetupStatus | null; busy: boolean; error: string | null }>();
const emit = defineEmits<{ close: []; save: [choice: ProviderSetupChoice] }>();
const { t } = useI18n();
const isolated = ref(true);
const shareSkills = ref(true);
watch(() => props.setup, setup => {
  isolated.value = setup?.isolated ?? true;
  shareSkills.value = setup?.shareSkills ?? true;
}, { immediate: true });
</script>

<style scoped>
.provider-setup__choices {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.provider-setup__choices :deep(.el-radio) {
  margin-right: 0;
}

.provider-setup__skills {
  margin-left: var(--space-12);
}

.provider-setup__existing {
  margin-top: var(--space-6);
}
</style>
