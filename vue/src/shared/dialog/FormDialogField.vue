<template>
  <section class="app-form-dialog__field">
    <div class="app-form-dialog__field-heading">
      <label
        v-if="labelFor"
        class="app-form-dialog__label"
        :for="labelFor"
      >{{ label }}</label>
      <span v-else class="app-form-dialog__label">{{ label }}</span>
      <p v-if="help" class="app-form-dialog__help">{{ help }}</p>
    </div>
    <slot />
    <slot name="feedback" />
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  help?: string;
  label: string;
  labelFor?: string;
}>(), {
  help: '',
  labelFor: '',
});
</script>
