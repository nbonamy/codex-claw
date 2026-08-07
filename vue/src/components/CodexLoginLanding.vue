<template>
  <section class="codex-login" aria-label="Sign in to Codex Claw">
    <div class="codex-login__content">
      <div class="codex-login__mark">
        <img
          :src="appIconUrl"
          alt="Codex Claw"
        >
      </div>
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
      <button
        class="codex-login__cancel"
        :class="{ 'codex-login__cancel--hidden': !cancellable }"
        type="button"
        :aria-hidden="!cancellable"
        :disabled="!cancellable || cancelling"
        :tabindex="cancellable ? 0 : -1"
        @click="emit('cancel')"
      >
        {{ t('auth.cancel') }}
      </button>
      <p v-if="error" class="codex-login__error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const appIconUrl = new URL('../../assets/icon.png', import.meta.url).href;

defineProps<{
  loading?: boolean;
  cancellable?: boolean;
  cancelling?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{ cancel: []; login: [] }>();
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
  -webkit-app-region: drag;
}

.codex-login__content {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  transform: translateY(calc(-1 * var(--space-12)));
}

.codex-login__mark {
  width: 128px;
  height: 128px;
  overflow: hidden;
}

.codex-login__mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.codex-login h1 {
  margin: var(--space-16) 0 0;
  font-size: var(--font-size-28);
  line-height: var(--line-height-32);
}

.codex-login p {
  margin: var(--space-4) 0 0;
  color: var(--color-text-muted);
  line-height: var(--line-height-20);
}

.codex-login .el-button {
  margin-top: var(--space-16);
  -webkit-app-region: no-drag;
}

.codex-login__cancel {
  margin-top: var(--space-4);
  padding: var(--space-2) var(--space-4);
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: var(--font-size-12);
  line-height: var(--line-height-16);
  -webkit-app-region: no-drag;
}

.codex-login__cancel:hover:not(:disabled) {
  color: var(--color-text);
}

.codex-login__cancel:disabled {
  cursor: default;
  opacity: 0.5;
}

.codex-login__cancel--hidden {
  visibility: hidden;
  pointer-events: none;
}

.codex-login__error {
  margin-top: var(--space-6) !important;
  color: var(--color-error) !important;
}
</style>
