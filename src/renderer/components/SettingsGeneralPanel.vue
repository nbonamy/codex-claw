<template>
  <SettingsPanelFrame
    title="General"
    title-id="settings-general-title"
  >
    <section
      class="settings-general-panel__section"
      aria-labelledby="settings-general-permissions-title"
    >
      <header class="settings-general-panel__section-header">
        <h3 id="settings-general-permissions-title">System permissions</h3>
      </header>

      <article class="settings-general-panel__permission">
        <span
          class="settings-general-panel__permission-icon"
          aria-hidden="true"
        >
          <ShieldCheckIcon />
        </span>
        <div class="settings-general-panel__permission-copy">
          <strong>Accessibility</strong>
          <span>{{ accessibilityDescription }}</span>
        </div>
        <div class="settings-general-panel__permission-actions">
          <span
            class="settings-general-panel__permission-status"
            :class="{ 'settings-general-panel__permission-status--granted': accessibilityGranted }"
          >
            {{ accessibilityStatusLabel }}
          </span>
          <el-button
            v-if="showGrantButton"
            :loading="openingAccessibilitySettings"
            size="small"
            @click="grantAccessibility"
          >
            Grant
          </el-button>
          <el-button
            v-else-if="permissions?.accessibility.required"
            :loading="loadingPermissions"
            size="small"
            @click="loadPermissions"
          >
            Refresh
          </el-button>
        </div>
      </article>
    </section>
  </SettingsPanelFrame>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { SystemPermissionsStatus } from '../../shared/contracts';
import SettingsPanelFrame from './SettingsPanelFrame.vue';
import { ShieldCheckIcon } from '../shared/icons/app-icons';

const defaultPermissionsStatus: SystemPermissionsStatus = {
  platform: 'unknown',
  accessibility: {
    required: false,
    trusted: true,
  },
};

const props = defineProps<{
  getSystemPermissions?: () => Promise<SystemPermissionsStatus>;
  openAccessibilitySettings?: () => Promise<SystemPermissionsStatus>;
}>();

const permissions = ref<SystemPermissionsStatus | null>(null);
const loadingPermissions = ref(false);
const openingAccessibilitySettings = ref(false);

const accessibilityGranted = computed(() => permissions.value?.accessibility.trusted ?? false);
const showGrantButton = computed(() => permissions.value?.accessibility.required === true && !accessibilityGranted.value);
const accessibilityStatusLabel = computed(() => {
  if (!permissions.value) {
    return 'Checking';
  }

  if (!permissions.value.accessibility.required) {
    return 'Not needed';
  }

  return accessibilityGranted.value ? 'Granted' : 'Required';
});
const accessibilityDescription = computed(() => {
  if (permissions.value?.accessibility.required === false) {
    return 'Computer Use does not need this permission on this platform.';
  }

  return 'Required for Computer Use to inspect and click Codex Claw.';
});

onMounted(() => {
  void loadPermissions();
});

async function loadPermissions(): Promise<void> {
  loadingPermissions.value = true;
  try {
    permissions.value = await (props.getSystemPermissions ?? getSystemPermissions)();
  } finally {
    loadingPermissions.value = false;
  }
}

async function grantAccessibility(): Promise<void> {
  openingAccessibilitySettings.value = true;
  try {
    permissions.value = await (props.openAccessibilitySettings ?? openAccessibilitySettings)();
  } finally {
    openingAccessibilitySettings.value = false;
  }
}

async function getSystemPermissions(): Promise<SystemPermissionsStatus> {
  return window.codexClaw?.getSystemPermissions?.() ?? defaultPermissionsStatus;
}

async function openAccessibilitySettings(): Promise<SystemPermissionsStatus> {
  return window.codexClaw?.openAccessibilitySettings?.() ?? defaultPermissionsStatus;
}
</script>

<style scoped>
.settings-general-panel__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
}

.settings-general-panel__section-header h3 {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-15);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-20);
}

.settings-general-panel__permission {
  min-width: 0;
  display: grid;
  grid-template-columns: var(--space-24) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-12);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-12);
  background: var(--color-surface-low);
}

.settings-general-panel__permission-icon {
  width: var(--space-24);
  height: var(--space-24);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.settings-general-panel__permission-icon svg {
  width: var(--icon-md);
  height: var(--icon-md);
  stroke-width: 2;
}

.settings-general-panel__permission-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.settings-general-panel__permission-copy strong {
  color: var(--color-text);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
}

.settings-general-panel__permission-copy span {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  line-height: var(--line-height-18);
}

.settings-general-panel__permission-actions {
  display: flex;
  align-items: center;
  gap: var(--space-8);
}

.settings-general-panel__permission-status {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-18);
}

.settings-general-panel__permission-status--granted {
  color: var(--color-success);
}
</style>
