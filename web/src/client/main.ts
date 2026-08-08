import { mountClawVueApp } from '@codex-claw/vue/bootstrap';
import { createClawBrowserClient } from '@codex-claw/web-client/client';

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
  return url.href;
}
