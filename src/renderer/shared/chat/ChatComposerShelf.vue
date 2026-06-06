<template>
  <div v-if="visible" class="chat-composer-shelf">
    <ChatQueuedPrompts
      :prompts="queuedPrompts"
      @delete="$emit('deleteQueuedPrompt', $event)"
      @steer="$emit('steerQueuedPrompt', $event)"
    />
    <ChatGoal
      :goal="goal"
      @clear="$emit('clearGoal')"
      @edit="$emit('editGoal')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ThreadGoal } from '../../../shared/contracts';
import ChatGoal from './ChatGoal.vue';
import ChatQueuedPrompts from './ChatQueuedPrompts.vue';
import type { QueuedChatPrompt } from './queued-prompts';

const props = defineProps<{
  goal: ThreadGoal | null;
  queuedPrompts: QueuedChatPrompt[];
}>();

defineEmits<{
  clearGoal: [];
  deleteQueuedPrompt: [promptId: string];
  editGoal: [];
  steerQueuedPrompt: [promptId: string];
}>();

const visible = computed(() => Boolean(props.goal) || props.queuedPrompts.length > 0);
</script>

<style scoped>
.chat-composer-shelf {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.chat-composer-shelf:has(.chat-queued-prompts) {
  &:deep() {
    .chat-goal {
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }
  }
}


</style>
