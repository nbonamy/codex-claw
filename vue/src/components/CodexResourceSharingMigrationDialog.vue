<template>
  <el-dialog
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :model-value="visible"
    :show-close="false"
    append-to-body
    class="claw-dialog"
    title="Share skills and plugins with ChatGPT?"
    width="460px"
  >
    <p class="codex-resource-sharing-migration-dialog__copy">
      Codex Claw can use the skills and plugins installed in ChatGPT. Migrating replaces the existing Claw folders with links to <code>~/.codex</code>.
    </p>
    <p
      v-if="blocked"
      class="codex-resource-sharing-migration-dialog__warning"
      role="status"
    >
      Migration cannot run while chats are active. Wait for them to finish, or keep the current isolated setup.
    </p>
    <template #footer>
      <div class="claw-dialog__footer">
        <button
          class="claw-button claw-button--tertiary"
          type="button"
          :disabled="pending"
          @click="$emit('decline')"
        >
          Keep isolated
        </button>
        <button
          class="claw-button claw-button--primary"
          type="button"
          :aria-busy="pending"
          :disabled="blocked || pending"
          @click="$emit('migrate')"
        >
          Migrate
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
defineProps<{
  blocked: boolean;
  pending: boolean;
  visible: boolean;
}>();

defineEmits<{
  decline: [];
  migrate: [];
}>();
</script>

<style scoped>
.codex-resource-sharing-migration-dialog__copy,
.codex-resource-sharing-migration-dialog__warning {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-14);
  line-height: var(--line-height-20);
}

.codex-resource-sharing-migration-dialog__warning {
  margin-top: var(--space-12);
  color: var(--color-warning);
}

.codex-resource-sharing-migration-dialog__copy code {
  font-family: var(--font-family-mono);
}
</style>
