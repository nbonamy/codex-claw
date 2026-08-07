import { createApp } from 'vue';
import type { ClawClient } from '@codex-claw/core/client';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import '@codex-app-sdk/vue/styles.css';
import './styles/variables.css';
import './styles/theme.css';
import './styles/base.css';
import App from './App.vue';
import AnnotationOverlayApp from './AnnotationOverlayApp.vue';
import { i18n } from './i18n';
import { applyRendererPlatform } from './renderer-platform';
import { configureClawClient } from './platform-api';

export type MountClawVueAppOptions = {
  client: ClawClient;
  surface?: 'annotation-overlay' | 'main';
  target?: Element | string;
};

export function mountClawVueApp(options: MountClawVueAppOptions) {
  configureClawClient(options.client);
  applyRendererPlatform(document.documentElement, navigator.platform, navigator.userAgent);

  const surface = options.surface
    ?? (new URLSearchParams(window.location.search).get('surface') === 'annotation-overlay'
      ? 'annotation-overlay'
      : 'main');
  const rootComponent = surface === 'annotation-overlay' ? AnnotationOverlayApp : App;

  return createApp(rootComponent)
    .use(ElementPlus)
    .use(i18n)
    .mount(options.target ?? '#app');
}
