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
        aria-label="Add project"
      >
        <PlusCircleIcon aria-hidden="true" />
        <span>Add project</span>
      </button>
    </template>

    <div class="start-work-menu">
      <span class="start-work-menu__heading">Add project from</span>
      <AppMenu
        class="app-menu--embedded"
        ariaLabel="Add project from"
        :items="startWorkMenuItems"
        @select="select"
      />
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { PlusCircleIcon } from '../shared/icons/app-icons';
import AppMenu from '../shared/menu/AppMenu.vue';
import { isStartWorkAction, startWorkMenuItems, type StartWorkAction } from './start-work-actions';

const emit = defineEmits<{
  select: [action: StartWorkAction];
}>();

const visible = ref(false);

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
