<template>
  <el-popover
    v-model:visible="visible"
    placement="bottom-start"
    trigger="click"
    :width="240"
    popper-class="claw-popover start-work-menu__popover"
  >
    <template #reference>
      <button
        class="start-work-menu__trigger"
        type="button"
        :aria-label="t('startWork.addProject')"
      >
        <FoldersIcon data-icon="folders" aria-hidden="true" />
        <span>{{ t('startWork.addProject') }}</span>
      </button>
    </template>

    <div class="start-work-menu">
      <span class="start-work-menu__heading">{{ t('startWork.addProjectFrom') }}</span>
      <AppMenu
        class="app-menu--embedded"
        :ariaLabel="t('startWork.addProjectFrom')"
        :items="menuItems"
        @select="select"
      />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { FoldersIcon } from '../shared/icons/app-icons';
import AppMenu from '../shared/menu/AppMenu.vue';
import { isStartWorkAction, startWorkMenuItems, type StartWorkAction } from './start-work-actions';

const emit = defineEmits<{
  select: [action: StartWorkAction];
}>();

const { t } = useI18n();
const visible = ref(false);
const menuItems = computed(() => startWorkMenuItems(t));

function select(action: string): void {
  if (!isStartWorkAction(action)) return;
  visible.value = false;
  emit('select', action);
}
</script>

<style scoped>
.start-work-menu__trigger {
  box-sizing: border-box;
  width: 100%;
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-6);
  border: 0;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  background: transparent;
  font: inherit;
  font-size: var(--font-size-14);
  font-weight: var(--font-weight-medium);
  text-align: left;
  cursor: pointer;
}

.start-work-menu__trigger:hover,
.start-work-menu__trigger:focus-visible {
  color: var(--color-text);
  outline: 0;
}

.start-work-menu__trigger svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

.start-work-menu {
  display: grid;
  gap: var(--space-1);
}

.start-work-menu__heading {
  padding: var(--space-3) var(--space-6) var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
  font-weight: var(--font-weight-medium);
}
</style>
