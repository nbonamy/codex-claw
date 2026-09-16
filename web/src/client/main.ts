import { mountClawVueApp } from '@codex-claw/vue/bootstrap';
import { createClawBrowserClient } from '../browser-client';

const clientId = localStorage.getItem('claw-client-id') ?? crypto.randomUUID();
localStorage.setItem('claw-client-id', clientId);

const api = createClawBrowserClient({
  createSocket: () => new WebSocket(webSocketUrl('/claw')),
});

mountClawVueApp({
  client: {
    api,
    platform: 'web',
  },
});

function webSocketUrl(pathname: string): string {
  const url = new URL(pathname, window.location.href);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('clientId', clientId);
  return url.href;
}
