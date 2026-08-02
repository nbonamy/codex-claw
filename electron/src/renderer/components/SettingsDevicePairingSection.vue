<template>
  <SettingsSection
    title="Device pairing"
    title-id="settings-connections-device-pairing-title"
  >
    <div class="settings-device-pairing">
      <div class="settings-device-pairing__header">
        <div>
          <strong>Codex mobile devices</strong>
          <span>{{ description }}</span>
        </div>
        <div class="settings-device-pairing__actions">
          <el-button
            v-if="status?.status === 'disabled'"
            size="small"
            type="primary"
            :loading="action === 'enable'"
            :disabled="status.allowRemoteControl === false"
            @click="enablePairing"
          >
            Enable
          </el-button>
          <template v-else-if="status">
            <el-button
              size="small"
              :loading="action === 'start'"
              :disabled="status.status !== 'connected'"
              @click="startPairing"
            >
              Pair device
            </el-button>
            <el-button
              size="small"
              :loading="action === 'disable'"
              @click="disablePairing"
            >
              Disable
            </el-button>
          </template>
        </div>
      </div>

      <p
        v-if="error"
        class="settings-device-pairing__error"
      >
        {{ error }}
      </p>
      <div
        v-else-if="loadingStatus"
        class="settings-device-pairing__loading"
      >
        Checking device pairing...
      </div>

      <div
        v-if="session"
        class="settings-device-pairing__code"
      >
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="Codex device pairing QR code"
        >
        <span>Scan with the Codex mobile app or enter this code</span>
        <strong>{{ session.manualPairingCode || session.pairingCode }}</strong>
        <em>{{ sessionStatus }}</em>
      </div>

      <div
        v-if="status?.status === 'connected'"
        class="settings-device-pairing__devices"
      >
        <div class="settings-device-pairing__devices-heading">
          <strong>Paired devices</strong>
          <el-button
            text
            size="small"
            :loading="loadingDevices"
            @click="loadDevices"
          >
            Refresh
          </el-button>
        </div>
        <span
          v-if="!loadingDevices && devices.length === 0"
          class="settings-device-pairing__empty"
        >
          No paired devices
        </span>
        <article
          v-for="device in devices"
          :key="device.clientId"
          class="settings-device-pairing__device"
        >
          <div>
            <strong>{{ device.displayName || device.deviceModel || 'Codex device' }}</strong>
            <span>{{ deviceLabel(device) }}</span>
          </div>
          <el-button
            text
            type="danger"
            size="small"
            :loading="revokingDeviceId === device.clientId"
            @click="confirmRevoke(device)"
          >
            Revoke
          </el-button>
        </article>
      </div>
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { toString as qrCodeToString } from 'qrcode';
import type { DevicePairingSession, DevicePairingStatus, PairedDevice } from '@codex-claw/shared/contracts';
import { codexPairingUrl } from '../device-pairing';
import SettingsSection from './SettingsSection.vue';

const props = withDefaults(defineProps<{
  getStatus?: () => Promise<DevicePairingStatus>;
  enable?: () => Promise<DevicePairingStatus>;
  disable?: () => Promise<DevicePairingStatus>;
  start?: () => Promise<DevicePairingSession>;
  check?: (session: DevicePairingSession) => Promise<boolean>;
  listDevices?: (environmentId: string) => Promise<PairedDevice[]>;
  revokeDevice?: (environmentId: string, clientId: string) => Promise<void>;
}>(), {
  getStatus: async () => ({ status: 'disabled' as const }),
  enable: async () => ({ status: 'disabled' as const }),
  disable: async () => ({ status: 'disabled' as const }),
  start: async () => ({ pairingCode: '', environmentId: '', expiresAt: '' }),
  check: async () => false,
  listDevices: async () => [],
  revokeDevice: async () => undefined,
});

const status = ref<DevicePairingStatus | null>(null);
const session = ref<DevicePairingSession | null>(null);
const devices = ref<PairedDevice[]>([]);
const loadingStatus = ref(false);
const loadingDevices = ref(false);
const error = ref<string | null>(null);
const action = ref<'enable' | 'disable' | 'start' | null>(null);
const revokingDeviceId = ref<string | null>(null);
const claimed = ref(false);
const qrDataUrl = ref<string | null>(null);
let pairingPollTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let statusPollTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

const description = computed(() => {
  if (status.value?.allowRemoteControl === false) return 'Disabled by your Codex configuration.';
  if (status.value?.status === 'connected') return 'Remote control is on. Pair and manage devices that can access this Claw instance.';
  if (status.value?.status === 'connecting') return 'Connecting to the Codex remote-control service...';
  if (status.value?.status === 'errored') return 'Codex remote control needs attention.';
  return 'Connect the official Codex mobile app to this Claw instance.';
});

const sessionStatus = computed(() => {
  if (claimed.value) return 'Paired successfully';
  if (!session.value) return '';
  return new Date(session.value.expiresAt).getTime() <= Date.now()
    ? 'Code expired'
    : `Expires ${new Date(session.value.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
});

onMounted(() => void loadStatus());
onBeforeUnmount(() => {
  stopPairingPoll();
  stopStatusPoll();
});

async function loadStatus(): Promise<void> {
  loadingStatus.value = true;
  error.value = null;
  try {
    status.value = await props.getStatus();
    if (status.value.status === 'connected') await loadDevices();
    if (status.value.status === 'connecting') scheduleStatusPoll();
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loadingStatus.value = false;
  }
}

async function enablePairing(): Promise<void> {
  action.value = 'enable';
  error.value = null;
  try {
    status.value = await props.enable();
    if (status.value.status === 'connected') await loadDevices();
    if (status.value.status === 'connecting') scheduleStatusPoll();
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    action.value = null;
  }
}

async function disablePairing(): Promise<void> {
  action.value = 'disable';
  error.value = null;
  try {
    status.value = await props.disable();
    session.value = null;
    qrDataUrl.value = null;
    devices.value = [];
    stopPairingPoll();
    stopStatusPoll();
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    action.value = null;
  }
}

async function startPairing(): Promise<void> {
  action.value = 'start';
  error.value = null;
  claimed.value = false;
  stopPairingPoll();
  try {
    session.value = await props.start();
    qrDataUrl.value = await pairingCodeDataUrl(session.value.pairingCode);
    schedulePairingPoll();
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    action.value = null;
  }
}

function schedulePairingPoll(): void {
  stopPairingPoll();
  pairingPollTimer = globalThis.setTimeout(() => void pollPairing(), 2_000);
}

async function pollPairing(): Promise<void> {
  pairingPollTimer = null;
  const activeSession = session.value;
  if (!activeSession || new Date(activeSession.expiresAt).getTime() <= Date.now()) return;
  try {
    claimed.value = await props.check(activeSession);
    if (claimed.value) {
      await loadDevices();
      return;
    }
  } catch (cause) {
    error.value = errorMessage(cause);
    return;
  }
  schedulePairingPoll();
}

function stopPairingPoll(): void {
  if (pairingPollTimer !== null) globalThis.clearTimeout(pairingPollTimer);
  pairingPollTimer = null;
}

function scheduleStatusPoll(): void {
  stopStatusPoll();
  statusPollTimer = globalThis.setTimeout(() => {
    statusPollTimer = null;
    void loadStatus();
  }, 2_000);
}

function stopStatusPoll(): void {
  if (statusPollTimer !== null) globalThis.clearTimeout(statusPollTimer);
  statusPollTimer = null;
}

async function loadDevices(): Promise<void> {
  const environmentId = status.value?.environmentId ?? session.value?.environmentId;
  if (!environmentId) return;
  loadingDevices.value = true;
  try {
    devices.value = await props.listDevices(environmentId);
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loadingDevices.value = false;
  }
}

async function confirmRevoke(device: PairedDevice): Promise<void> {
  const environmentId = status.value?.environmentId ?? session.value?.environmentId;
  if (!environmentId) return;
  try {
    await ElMessageBox.confirm(
      `${device.displayName || device.deviceModel || 'This device'} will no longer be able to connect to this Claw instance.`,
      'Revoke paired device?',
      { cancelButtonText: 'Cancel', confirmButtonText: 'Revoke', type: 'warning' },
    );
  } catch {
    return;
  }
  revokingDeviceId.value = device.clientId;
  try {
    await props.revokeDevice(environmentId, device.clientId);
    devices.value = devices.value.filter((candidate) => candidate.clientId !== device.clientId);
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    revokingDeviceId.value = null;
  }
}

function deviceLabel(device: PairedDevice): string {
  return [device.platform, device.deviceType, device.appVersion ? `Codex ${device.appVersion}` : null]
    .filter(Boolean)
    .join(' · ') || 'Paired Codex client';
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function pairingCodeDataUrl(pairingCode: string): Promise<string> {
  const svg = await qrCodeToString(codexPairingUrl(pairingCode), {
    type: 'svg', margin: 1, width: 180,
    color: { dark: '#111111', light: '#ffffff' },
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
</script>

<style scoped>
.settings-device-pairing {
  display: flex;
  flex-direction: column;
  gap: var(--space-12);
  padding: var(--space-12);
}

.settings-device-pairing__header,
.settings-device-pairing__devices-heading,
.settings-device-pairing__device {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-12);
}

.settings-device-pairing__header > div:first-child,
.settings-device-pairing__device > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.settings-device-pairing__header strong,
.settings-device-pairing__devices-heading strong,
.settings-device-pairing__device strong {
  color: var(--color-text);
  font-size: var(--font-size-14);
  font-weight: 600;
}

.settings-device-pairing__header span,
.settings-device-pairing__device span,
.settings-device-pairing__code span,
.settings-device-pairing__code em {
  color: var(--color-text-muted);
  font-size: var(--font-size-12);
}

.settings-device-pairing__actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
}

.settings-device-pairing__code {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  padding: var(--space-20);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface-low);
}

.settings-device-pairing__code em {
  font-style: normal;
}

.settings-device-pairing__code strong {
  color: var(--color-text);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-24);
  letter-spacing: 0.12em;
}

.settings-device-pairing__code img {
  width: 180px;
  height: 180px;
  border-radius: var(--radius-sm);
}

.settings-device-pairing__devices {
  display: flex;
  flex-direction: column;
}

.settings-device-pairing__device {
  padding: var(--space-10) 0;
  border-top: 1px solid var(--color-border);
}

.settings-device-pairing__empty,
.settings-device-pairing__loading {
  color: var(--color-text-muted);
  font-size: var(--font-size-13);
  padding: var(--space-8);
}

.settings-device-pairing__error {
  color: var(--color-error);
  font-size: var(--font-size-13);
  margin: 0;
}
</style>
