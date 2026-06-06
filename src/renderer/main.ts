import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import './styles/variables.css';
import './styles/theme.css';
import './styles/base.css';
import App from './App.vue';
import { i18n } from './i18n';

createApp(App)
  .use(ElementPlus)
  .use(i18n)
  .mount('#app');
