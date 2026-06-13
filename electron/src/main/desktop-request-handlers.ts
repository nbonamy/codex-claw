import { shell } from 'electron';
import type { SystemPermissionsStatus } from '@codex-claw/shared/contracts';
import { getSystemPermissionsStatus, openAccessibilitySettings } from './system-permissions';

export type DesktopRequestHandler = (params: unknown) => unknown | Promise<unknown>;

export type DesktopRequestHandlersOptions = {
  openExternal: (url: string) => Promise<unknown>;
  getSystemPermissionsStatus: () => SystemPermissionsStatus;
  openAccessibilitySettings: () => Promise<SystemPermissionsStatus>;
};

export function createRuntimeDesktopRequestHandlers(): Record<string, DesktopRequestHandler> {
  return createDesktopRequestHandlers({
    openExternal: (url) => shell.openExternal(url),
    getSystemPermissionsStatus,
    openAccessibilitySettings,
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
    'desktop/systemPermissions/get': () => options.getSystemPermissionsStatus(),
    'desktop/systemPermissions/openAccessibilitySettings': () => options.openAccessibilitySettings(),
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
