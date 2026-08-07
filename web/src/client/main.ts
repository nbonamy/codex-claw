import { mountClawVueApp } from '@codex-claw/vue/bootstrap';
import { webClawHostCapabilities } from '@codex-claw/core/client';
import { createClawBrowserClient } from '../browser-client';

const api = createClawBrowserClient({
  createSocket: () => new WebSocket(webSocketUrl('/claw')),
});

mountClawVueApp({
  client: {
    api,
    capabilities: webClawHostCapabilities,
    platform: 'web',
  },
});

function webSocketUrl(pathname: string): string {
  const url = new URL(pathname, window.location.href);
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}
