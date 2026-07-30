<template>
  <section class="codex-login" aria-label="Sign in to Codex Claw">
    <div class="codex-login__content">
      <div class="codex-login__mark" aria-hidden="true">C</div>
      <h1>{{ t('auth.title') }}</h1>
      <p>{{ t('auth.description') }}</p>
      <el-button
        type="primary"
        size="large"
        :loading="loading"
        @click="emit('login')"
      >
        {{ loading ? t('auth.waiting') : t('auth.continue') }}
      </el-button>
      <p v-if="error" class="codex-login__error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  loading?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{ login: [] }>();
const { t } = useI18n();
</script>

<style scoped>
.codex-login {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: var(--space-20);
  background: var(--color-shell-main);
  color: var(--color-text);
}

.codex-login__content {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  text-align: center;
}

.codex-login__mark {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: var(--radius-2xl);
  color: var(--color-on-primary);
  background: var(--color-primary);
  font-size: var(--font-size-24);
  font-weight: var(--font-weight-semibold);
}

.codex-login h1 {
  margin: var(--space-4) 0 0;
  font-size: var(--font-size-24);
}

.codex-login p {
  margin: 0;
  color: var(--color-text-muted);
  line-height: var(--line-height-20);
}

.codex-login__error {
  color: var(--color-error) !important;
}
</style>
