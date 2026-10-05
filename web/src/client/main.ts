import { mountAppVueApp } from '@workspace/vue/bootstrap';
import { createAppBrowserClient } from '../browser-client';

const clientId = localStorage.getItem('app-client-id') ?? crypto.randomUUID();
localStorage.setItem('app-client-id', clientId);

const api = createAppBrowserClient({
  createSocket: () => new WebSocket(webSocketUrl('/app')),
});

mountAppVueApp({
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
