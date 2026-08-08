import { mountClawVueApp } from '@codex-claw/vue/bootstrap';

if (!window.codexClaw) {
  throw new Error('Codex Claw preload API is unavailable.');
}

mountClawVueApp({
  client: {
    api: window.codexClaw,
    platform: 'desktop',
  },
});
