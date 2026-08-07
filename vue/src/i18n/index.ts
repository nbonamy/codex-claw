import { createI18n } from 'vue-i18n';
import { messages, type MessageSchema } from './messages';

export const i18n = createI18n<[MessageSchema], 'en'>({
  fallbackLocale: 'en',
  legacy: false,
  locale: 'en',
  messages,
});
