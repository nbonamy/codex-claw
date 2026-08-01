import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'codex-app-sdk/styles.css';
import './styles/variables.css';
import './styles/theme.css';
import './styles/base.css';
import App from './App.vue';
import { i18n } from './i18n';
import { applyRendererPlatform } from './renderer-platform';
import { registerClawToolTitlePresenter } from './tool-title-presenter';

applyRendererPlatform(document.documentElement, navigator.platform, navigator.userAgent);
registerClawToolTitlePresenter();

createApp(App)
  .use(ElementPlus)
  .use(i18n)
  .mount('#app');
