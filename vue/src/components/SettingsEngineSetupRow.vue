<template>
  <SettingsRow :title="$t('engineSetup.title')" :description="$t(home?.isolated !== false ? 'auth.separateChats' : 'auth.existingSetup')">
    <template #control>
      <el-button @click="emit('customize')">{{ $t('auth.customize') }}</el-button>
    </template>
    <template #copy><span v-if="home" class="settings-row__description">{{ home.homePath }}</span></template>
  </SettingsRow>
</template>

<script setup lang="ts">
import type { ProviderHomeSettings } from '@workspace/core/contracts/provider-setup';
import SettingsRow from './SettingsRow.vue';
defineProps<{ home?: ProviderHomeSettings }>();
const emit = defineEmits<{ customize: [] }>();
</script>
