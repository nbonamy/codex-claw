<template>
  <Teleport to="body">
    <div ref="menuRoot" class="mission-context-menu" :style="menuStyle">
      <AppMenu
        :ariaLabel="t('missions.actions')"
        :items="menuItems"
        @select="selectMenuItem"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppMenu from '../shared/menu/AppMenu.vue';
import type { AppMenuItem } from '../shared/menu/app-menu';
import { Trash2Icon } from '../shared/icons/app-icons';

const props = defineProps<{ x: number; y: number }>();
const emit = defineEmits<{ close: []; delete: [] }>();
const { t } = useI18n();
const viewportMargin = 8;
const menuRoot = ref<HTMLElement | null>(null);
const menuPosition = ref({ x: props.x, y: props.y });
const menuStyle = computed(() => ({ left: `${menuPosition.value.x}px`, top: `${menuPosition.value.y}px` }));
const menuItems = computed<AppMenuItem[]>(() => [{
  id: 'delete-mission',
  type: 'action',
  label: t('missions.deleteAction'),
  icon: Trash2Icon,
  danger: true,
}]);

onMounted(() => {
  document.addEventListener('click', closeOnDocumentClick);
  document.addEventListener('keydown', closeOnEscape);
  window.addEventListener('resize', fitMenuInViewport);
  void nextTick(fitMenuInViewport);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnDocumentClick);
  document.removeEventListener('keydown', closeOnEscape);
  window.removeEventListener('resize', fitMenuInViewport);
});

watch(() => [props.x, props.y], ([x, y]) => {
  menuPosition.value = { x: x ?? 0, y: y ?? 0 };
  void nextTick(fitMenuInViewport);
});

function selectMenuItem(itemId: string): void {
  if (itemId === 'delete-mission') emit('delete');
}

function closeOnDocumentClick(event: MouseEvent): void {
  if (event.target instanceof Node && menuRoot.value?.contains(event.target)) return;
  emit('close');
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

function fitMenuInViewport(): void {
  const menu = menuRoot.value;
  if (!menu) return;
  const { width, height } = menu.getBoundingClientRect();
  menuPosition.value = {
    x: Math.max(viewportMargin, Math.min(props.x, window.innerWidth - width - viewportMargin)),
    y: Math.max(viewportMargin, Math.min(props.y, window.innerHeight - height - viewportMargin)),
  };
}
</script>

<style scoped>
.mission-context-menu {
  position: fixed;
  z-index: 20;
}
</style>
