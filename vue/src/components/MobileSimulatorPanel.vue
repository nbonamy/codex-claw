<template>
  <section class="mobile-simulator" :aria-label="$t('surface.mobileSimulator.title')">
    <header class="mobile-simulator__toolbar">
      <template v-if="attachment">
        <span class="mobile-simulator__name">{{ attachment.device.name }}</span>
        <el-button size="small" :disabled="busy" @click="button('home')">{{
          $t('surface.mobileSimulator.home')
        }}</el-button>
        <el-button
          v-if="attachment.device.platform === 'android'"
          size="small"
          :disabled="busy"
          @click="button('back')"
          >{{ $t('surface.mobileSimulator.back') }}</el-button
        >
        <el-button size="small" :disabled="busy" @click="detach">{{ $t('surface.mobileSimulator.detach') }}</el-button>
      </template>
      <template v-else>
        <el-select
          v-model="selectedDevice"
          :aria-label="$t('surface.mobileSimulator.device')"
          :placeholder="$t('surface.mobileSimulator.select')"
          :disabled="busy"
        >
          <el-option
            v-for="device in catalog.devices"
            :key="device.id"
            :label="`${device.name} · ${device.platform}${device.owner && device.owner !== agentId ? ` · ${$t('surface.mobileSimulator.inUse')}` : ''}`"
            :value="device.id"
            :disabled="Boolean(device.owner && device.owner !== agentId)"
          />
        </el-select>
        <el-button size="small" :disabled="busy || !selectedDevice" @click="attach">{{
          $t('surface.mobileSimulator.attach')
        }}</el-button>
        <el-button size="small" :disabled="busy" @click="refreshDevices">{{
          $t('surface.mobileSimulator.refresh')
        }}</el-button>
      </template>
    </header>
    <p v-if="error" class="mobile-simulator__error" role="alert">
      {{ error }} <button type="button" @click="retry">{{ $t('surface.mobileSimulator.retry') }}</button>
    </p>
    <div v-if="!attachment" class="mobile-simulator__setup">
      <p>{{ $t('surface.mobileSimulator.intro') }}</p>
      <p v-for="item in catalog.setup" :key="item.platform">
        {{ item.message }}
        <button type="button" @click="openSetup(item.url)">{{ $t('surface.mobileSimulator.setup') }}</button>
      </p>
      <p v-if="!catalog.devices.length && !catalog.setup.length">{{ $t('surface.mobileSimulator.empty') }}</p>
    </div>
    <div v-else class="mobile-simulator__screen">
      <img
        v-if="frame"
        :src="`data:${frame.mimeType};base64,${frame.data}`"
        :alt="$t('surface.mobileSimulator.screen')"
        tabindex="0"
        draggable="false"
        :aria-busy="busy"
        @pointerdown="pointerDown"
        @pointerup="pointerUp"
        @pointercancel="gesture = null"
        @keydown="keyDown"
      />
      <span v-else>{{ $t(error ? 'surface.mobileSimulator.unavailable' : 'surface.mobileSimulator.reading') }}</span>
    </div>
    <form v-if="attachment" class="mobile-simulator__toolbar" @submit.prevent="sendText">
      <el-input
        ref="textInput"
        v-model="text"
        :aria-label="$t('surface.mobileSimulator.textLabel')"
        :placeholder="$t('surface.mobileSimulator.textPlaceholder')"
        :disabled="busy"
        maxlength="2000"
      />
      <el-button native-type="submit" size="small" :disabled="busy || !text">{{
        $t('surface.mobileSimulator.send')
      }}</el-button>
    </form>
    <span v-if="attachment" class="mobile-simulator__hint">{{ $t('surface.mobileSimulator.hint') }}</span>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type {
  MobileAction,
  MobileAttachment,
  MobileCatalog,
  MobileFrame,
  MobileRequest,
  MobileResult,
} from '@workspace/core/mobile-simulator';
import { appApi, appPlatformActions } from '../platform-api';
const props = defineProps<{ agentId: string; visible: boolean }>();
const attachment = ref<MobileAttachment | null>(null);
const catalog = ref<MobileCatalog>({ devices: [], setup: [] });
const selectedDevice = ref('');
const frame = ref<MobileFrame | null>(null);
const error = ref('');
const busy = ref(false);
const text = ref('');
const textInput = ref<{ focus(): void }>();
let generation = 0;
let operation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let gesture: { x: number; y: number; width: number; height: number; attachmentId: string; started: number } | null =
  null;

function execute(input: MobileRequest): Promise<MobileResult> {
  if (!appApi?.mobileSimulator) return Promise.reject(new Error('Mobile simulators require the desktop app.'));
  return appApi.mobileSimulator(props.agentId, input);
}
function apply(result: MobileResult) {
  if (attachment.value?.id !== result.attachment?.id) frame.value = null;
  attachment.value = result.attachment;
  if (result.catalog) catalog.value = result.catalog;
  if (result.frame) frame.value = result.frame;
}
async function run(input: MobileRequest) {
  const identity = generation;
  operation++;
  busy.value = true;
  error.value = '';
  try {
    const result = await execute(input);
    if (identity === generation) apply(result);
  } catch (cause) {
    if (identity === generation) {
      error.value = cause instanceof Error ? cause.message : String(cause);
      frame.value = null;
    }
  } finally {
    if (identity === generation) busy.value = false;
  }
}
async function refreshDevices() {
  await run({ action: 'list' });
}
async function attach() {
  await run({ action: 'attach', deviceId: selectedDevice.value });
}
async function detach() {
  if (attachment.value) await run({ action: 'detach', attachmentId: attachment.value.id });
}
async function action(input: MobileAction) {
  if (attachment.value && !busy.value) await run({ ...input, attachmentId: attachment.value.id });
}
function button(button: 'home' | 'back') {
  void action({ action: 'button', button });
}
async function sendText() {
  const value = text.value;
  await action({ action: 'text', text: value });
  if (!error.value) text.value = '';
}
function openSetup(url: string) {
  void appPlatformActions.openExternal?.(url);
}
function retry() {
  error.value = '';
  void refreshDevices();
}

function point(event: PointerEvent) {
  if (!frame.value) return null;
  const rect = (event.currentTarget as HTMLImageElement).getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.max(
      0,
      Math.min(frame.value.width - 1, Math.round(((event.clientX - rect.left) * frame.value.width) / rect.width)),
    ),
    y: Math.max(
      0,
      Math.min(frame.value.height - 1, Math.round(((event.clientY - rect.top) * frame.value.height) / rect.height)),
    ),
  };
}
function pointerDown(event: PointerEvent) {
  if (busy.value || !frame.value || !attachment.value || event.button !== 0) return;
  const start = point(event);
  if (!start) return;
  event.preventDefault();
  (event.currentTarget as HTMLImageElement).focus();
  (event.currentTarget as HTMLImageElement).setPointerCapture?.(event.pointerId);
  gesture = {
    ...start,
    width: frame.value.width,
    height: frame.value.height,
    attachmentId: attachment.value.id,
    started: Date.now(),
  };
}
function pointerUp(event: PointerEvent) {
  const start = gesture;
  gesture = null;
  const end = point(event);
  if (!start || !end || busy.value || start.attachmentId !== attachment.value?.id) return;
  const common = { x: start.x, y: start.y, width: start.width, height: start.height };
  void action(
    Math.hypot(end.x - start.x, end.y - start.y) < 12
      ? { action: 'tap', ...common }
      : {
          action: 'swipe',
          ...common,
          toX: end.x,
          toY: end.y,
          durationMs: Math.min(3000, Math.max(100, Date.now() - start.started)),
        },
  );
}
function keyDown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey || busy.value) return;
  if (event.key === 'Enter' || event.key === 'Backspace') {
    event.preventDefault();
    void action({ action: 'button', button: event.key === 'Enter' ? 'enter' : 'backspace' });
  } else if (event.key.length === 1) {
    event.preventDefault();
    text.value += event.key;
    textInput.value?.focus();
  }
}
async function poll(identity: number) {
  if (identity !== generation || !props.visible) return;
  const currentOperation = operation;
  if (!busy.value && !error.value && !gesture) {
    try {
      const result = await execute({ action: 'status' });
      if (identity !== generation) return;
      if (currentOperation !== operation) {
        timer = setTimeout(() => void poll(identity), 700);
        return;
      }
      apply(result);
      if (result.attachment) {
        const screenshot = await execute({ action: 'screenshot', attachmentId: result.attachment.id });
        if (identity === generation && currentOperation === operation && !busy.value && !gesture) apply(screenshot);
      }
    } catch (cause) {
      if (identity === generation) {
        error.value = cause instanceof Error ? cause.message : String(cause);
        frame.value = null;
      }
    }
  }
  if (identity === generation) timer = setTimeout(() => void poll(identity), 700);
}
watch(
  () => [props.agentId, props.visible] as const,
  async () => {
    const identity = ++generation;
    clearTimeout(timer);
    gesture = null;
    text.value = '';
    selectedDevice.value = '';
    catalog.value = { devices: [], setup: [] };
    frame.value = null;
    attachment.value = null;
    busy.value = false;
    error.value = '';
    if (!props.visible) return;
    await refreshDevices();
    if (identity === generation) void poll(identity);
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
  clearTimeout(timer);
});
</script>

<style scoped>
.mobile-simulator {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--color-text);
}
.mobile-simulator__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  flex: none;
}
.mobile-simulator__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-simulator__screen {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.mobile-simulator__screen img {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  touch-action: none;
  user-select: none;
}
.mobile-simulator__setup,
.mobile-simulator__error {
  padding: 12px;
  margin: 0;
}
.mobile-simulator__error {
  color: var(--color-error);
}
.mobile-simulator__hint {
  padding: 4px 8px 8px;
  font-size: 11px;
  color: var(--color-text-muted);
}
</style>
