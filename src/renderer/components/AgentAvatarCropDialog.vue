<template>
  <el-dialog
    class="claw-dialog agent-avatar-crop-dialog"
    :model-value="visible"
    :teleported="false"
    width="320px"
    :show-close="false"
    destroy-on-close
    @update:model-value="onVisibilityChanged"
  >
    <template #header>
      <div class="claw-dialog__header">
        <h2 class="claw-dialog__title">Adjust Avatar</h2>
      </div>
    </template>

    <div class="agent-avatar-crop-dialog__body">
      <div class="agent-avatar-crop-dialog__stage">
        <img
          v-if="image"
          :src="image"
          alt=""
          :style="{ transform: `scale(${zoom})` }"
          draggable="false"
        />
      </div>

      <input
        v-model.number="zoom"
        class="agent-avatar-crop-dialog__range"
        type="range"
        min="1"
        max="3"
        step="0.05"
      />
    </div>

    <template #footer>
      <div class="claw-dialog__footer">
        <el-button @click="emit('cancel')">Cancel</el-button>
        <el-button
          type="primary"
          @click="apply"
        >
          Use Image
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { cropImageDataUrl } from './agent-avatar-crop';

const props = defineProps<{
  image: string | null;
  visible: boolean;
}>();

const emit = defineEmits<{
  apply: [avatar: string];
  cancel: [];
}>();

const zoom = ref(1);

watch(() => props.visible, (visible) => {
  if (visible) {
    zoom.value = 1;
  }
});

async function apply(): Promise<void> {
  if (!props.image) {
    return;
  }

  emit('apply', await cropImageDataUrl(props.image, zoom.value));
}

function onVisibilityChanged(nextVisible: boolean): void {
  if (!nextVisible) {
    emit('cancel');
  }
}
</script>

<style scoped>
.agent-avatar-crop-dialog__body {
  display: grid;
  justify-items: center;
  gap: var(--space-16);
}

.agent-avatar-crop-dialog__stage {
  width: 200px;
  height: 200px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--radius-full);
  background: var(--color-surface-base);
}

.agent-avatar-crop-dialog__stage img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform-origin: center;
}

.agent-avatar-crop-dialog__range {
  width: 220px;
  max-width: 100%;
}
</style>
