import { shell } from 'electron';

export type DesktopRequestHandler = (params: unknown) => unknown | Promise<unknown>;

export type DesktopRequestHandlersOptions = {
  openExternal: (url: string) => Promise<unknown>;
};

export function createRuntimeDesktopRequestHandlers(): Record<string, DesktopRequestHandler> {
  return createDesktopRequestHandlers({
    openExternal: (url) => shell.openExternal(url),
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
  };
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
