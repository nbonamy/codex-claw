import { shell } from 'electron';
import path from 'node:path';
import type { WorkProviderKind } from '@codex-claw/shared/contracts';
import type { WorkIntegrationTokenStore, WorkProviderToken } from '@codex-claw/shared/work-integration-tokens';
import { SafeStorageDesktopTokenStore } from './desktop-token-store';
import { defaultUserDataPath } from './user-data';

export type DesktopRequestHandler = (params: unknown) => unknown | Promise<unknown>;

export type DesktopRequestHandlersOptions = {
  openExternal: (url: string) => Promise<unknown>;
  tokenStore: WorkIntegrationTokenStore;
};

export function createRuntimeDesktopRequestHandlers(): Record<string, DesktopRequestHandler> {
  return createDesktopRequestHandlers({
    openExternal: (url) => shell.openExternal(url),
    tokenStore: new SafeStorageDesktopTokenStore(path.join(defaultUserDataPath(), 'work-integration-tokens.json')),
  });
}

export function createDesktopRequestHandlers(options: DesktopRequestHandlersOptions): Record<string, DesktopRequestHandler> {
  return {
    'desktop/openExternal': async (params) => {
      const record = requireRecord(params);
      const url = requireString(record.url, 'url');
      await options.openExternal(url);
      return true;
    },
    'desktop/workIntegrationToken/canStore': async () => options.tokenStore.canStoreTokens(),
    'desktop/workIntegrationToken/delete': async (params) => {
      const provider = requireWorkProvider(params);
      await options.tokenStore.delete(provider);
      return true;
    },
    'desktop/workIntegrationToken/get': async (params) => {
      const provider = requireWorkProvider(params);
      return options.tokenStore.get(provider);
    },
    'desktop/workIntegrationToken/set': async (params) => {
      const record = requireRecord(params);
      await options.tokenStore.set(requireWorkProviderToken(record.token));
      return true;
    },
  };
}

function requireWorkProvider(params: unknown): WorkProviderKind {
  const record = requireRecord(params);
  const provider = requireString(record.provider, 'provider');
  if (provider !== 'github') {
    throw new Error(`Unsupported work provider: ${provider}`);
  }
  return provider;
}

function requireWorkProviderToken(value: unknown): WorkProviderToken {
  const record = requireRecord(value);
  const provider = requireString(record.provider, 'provider');
  if (provider !== 'github') {
    throw new Error(`Unsupported work provider: ${provider}`);
  }

  const token: WorkProviderToken = {
    provider,
    accessToken: requireString(record.accessToken, 'accessToken'),
    tokenType: requireString(record.tokenType, 'tokenType'),
    connectedAt: requireString(record.connectedAt, 'connectedAt'),
  };

  if (record.scope !== undefined) {
    token.scope = requireString(record.scope, 'scope');
  }
  if (record.accountLabel !== undefined) {
    token.accountLabel = requireString(record.accountLabel, 'accountLabel');
  }

  return token;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Invalid desktop request params.');
  }
  return value;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid ${name}.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
