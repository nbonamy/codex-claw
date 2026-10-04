<template>
  <div
    class="open-in-control"
    :class="{ 'open-in-control--compact': variant === 'compact' }"
  >
    <button
      class="open-in-control__launch"
      type="button"
      :aria-label="currentApplication ? $t('dynamic.openIn', { application: currentApplication.label }) : $t('surface.openInControl.openInApplication')"
      :title="currentApplication ? $t('dynamic.openIn', { application: currentApplication.label }) : $t('surface.openInControl.openInApplication')"
      :disabled="disabled || !currentApplication"
      @click="openCurrentApplication"
    >
      <img
        v-if="currentApplication?.iconDataUrl"
        :src="currentApplication.iconDataUrl"
        alt=""
      />
      <ExternalLinkIcon v-else aria-hidden="true" />
    </button>
    <el-popover
      v-model:visible="menuOpen"
      placement="bottom-end"
      trigger="click"
      :teleported="true"
      :width="220"
      :offset="variant === 'compact' ? 4 : 8"
      :show-arrow="false"
      popper-class="claw-popover"
    >
      <template #reference>
        <button
          class="open-in-control__menu-trigger"
          type="button"
          :aria-label="$t('surface.openInControl.chooseOpenInApplication')"
          :title="$t('surface.openInControl.chooseApplication')"
          :aria-expanded="menuOpen"
          :disabled="disabled || catalog.applications.length === 0"
        >
          <ChevronDown aria-hidden="true" />
        </button>
      </template>
      <AppMenu
        class="app-menu--embedded"
        :ariaLabel="$t('surface.openInControl.openInApplication')"
        :items="menuItems"
        @select="selectApplication"
      />
    </el-popover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { OpenInApplication, OpenInApplicationCatalog } from '@codex-claw/core/contracts';
import { ChevronDown, ExternalLinkIcon } from './icons/app-icons';
import AppMenu from './menu/AppMenu.vue';
import { openInApplicationFromMenuItem, openInMenuItems } from './open-in';

const props = defineProps<{
  application: OpenInApplication;
  catalog: OpenInApplicationCatalog;
  disabled?: boolean;
  variant?: 'default' | 'compact';
}>();

const emit = defineEmits<{
  open: [application: OpenInApplication];
}>();

const menuOpen = ref(false);
const menuItems = computed(() => openInMenuItems(props.catalog));
const currentApplication = computed(() => (
  props.catalog.applications.find((application) => application.id === props.application)
  ?? props.catalog.applications.find((application) => application.id === props.catalog.defaultApplication)
  ?? props.catalog.applications[0]
  ?? null
));

function openCurrentApplication(): void {
  if (!props.disabled && currentApplication.value) emit('open', currentApplication.value.id);
}

function selectApplication(itemId: string): void {
  if (props.disabled) return;
  const application = openInApplicationFromMenuItem(itemId);
  if (!application) return;
  menuOpen.value = false;
  emit('open', application);
}

</script>

<style scoped>
.open-in-control {
  --open-in-application-icon-size: calc(var(--icon-lg) - var(--space-1));
  position: relative;
  display: inline-flex;
  align-items: stretch;
  height: 32px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-lowest);
  -webkit-app-region: no-drag;
}

.open-in-control--compact {
  height: 24px;
  border-color: transparent;
  background: transparent;
}

.open-in-control--compact > button {
  width: 28px;
}

.open-in-control > button {
  display: grid;
  place-items: center;
  width: 32px;
  padding: 0;
  border: 0;
  color: var(--color-text-muted);
  background: transparent;
  cursor: pointer;
}

.open-in-control > button:hover:not(:disabled) {
  background: var(--color-surface-low);
}

.open-in-control > button:disabled {
  cursor: default;
  opacity: 0.5;
}

.open-in-control__launch {
  border-radius: calc(var(--radius-lg) - 1px) 0 0 calc(var(--radius-lg) - 1px);
}

.open-in-control__menu-trigger {
  border-left: 1px solid var(--color-border) !important;
  border-radius: 0 calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px) 0;
}

.open-in-control__launch img,
.open-in-control__launch svg {
  width: var(--open-in-application-icon-size);
  height: var(--open-in-application-icon-size);
  object-fit: contain;
}

.open-in-control__launch img {
  border-radius: var(--radius-md);
}

.open-in-control__menu-trigger svg {
  width: var(--icon-md);
  height: var(--icon-md);
}

</style>
