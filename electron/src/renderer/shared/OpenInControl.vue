<template>
  <div
    ref="root"
    class="open-in-control"
    :class="{ 'open-in-control--compact': variant === 'compact' }"
  >
    <button
      class="open-in-control__launch"
      type="button"
      :aria-label="currentApplication ? `Open in ${currentApplication.label}` : 'Open in application'"
      :title="currentApplication ? `Open in ${currentApplication.label}` : 'Open in application'"
      :disabled="!currentApplication"
      @click="openCurrentApplication"
    >
      <img
        v-if="currentApplication?.iconDataUrl"
        :src="currentApplication.iconDataUrl"
        alt=""
      />
      <ExternalLinkIcon v-else aria-hidden="true" />
    </button>
    <button
      class="open-in-control__menu-trigger"
      type="button"
      aria-label="Choose Open In application"
      title="Choose application"
      :aria-expanded="menuOpen"
      :disabled="catalog.applications.length === 0"
      @click.stop="menuOpen = !menuOpen"
    >
      <ChevronDown aria-hidden="true" />
    </button>
    <AppMenu
      v-if="menuOpen"
      class="open-in-control__menu"
      ariaLabel="Open in application"
      :items="menuItems"
      @select="selectApplication"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { OpenInApplication, OpenInApplicationCatalog } from '@codex-claw/shared/contracts';
import { ChevronDown, ExternalLinkIcon } from './icons/app-icons';
import AppMenu from './menu/AppMenu.vue';
import { openInApplicationFromMenuItem, openInMenuItems } from './open-in';

const props = defineProps<{
  application: OpenInApplication;
  catalog: OpenInApplicationCatalog;
  variant?: 'default' | 'compact';
}>();

const emit = defineEmits<{
  open: [application: OpenInApplication];
}>();

const root = ref<HTMLElement | null>(null);
const menuOpen = ref(false);
const menuItems = computed(() => openInMenuItems(props.catalog));
const currentApplication = computed(() => (
  props.catalog.applications.find((application) => application.id === props.application)
  ?? props.catalog.applications.find((application) => application.id === props.catalog.defaultApplication)
  ?? props.catalog.applications[0]
  ?? null
));

onMounted(() => document.addEventListener('click', closeMenuOnOutsideClick));
onBeforeUnmount(() => document.removeEventListener('click', closeMenuOnOutsideClick));

function openCurrentApplication(): void {
  if (currentApplication.value) emit('open', currentApplication.value.id);
}

function selectApplication(itemId: string): void {
  const application = openInApplicationFromMenuItem(itemId);
  if (!application) return;
  menuOpen.value = false;
  emit('open', application);
}

function closeMenuOnOutsideClick(event: MouseEvent): void {
  if (!root.value?.contains(event.target as Node)) menuOpen.value = false;
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

.open-in-control__menu {
  position: absolute;
  z-index: 30;
  top: calc(100% + var(--space-2));
  right: 0;
  min-width: 220px;
}

.open-in-control--compact .open-in-control__menu {
  top: calc(100% + var(--space-1));
}
</style>
