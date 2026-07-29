import { backendMethods } from '@codex-claw/shared/backend-protocol/methods';
import { app, shell } from 'electron';
import type { SystemPermissionsStatus } from '@codex-claw/shared/contracts';
import { executeComputerUseCommand, getComputerUseStatus, isComputerUseCommand, requestComputerUseAccessibility, stopComputerUseHelper, type ComputerUseOptions } from './computer-use-tools';
import { getSystemPermissionsStatus, openAccessibilitySettings } from './system-permissions';

export type ClientRequestHandler = (params: unknown) => unknown | Promise<unknown>;

export type ClientRequestHandlersOptions = {
  openExternal: (url: string) => Promise<unknown>;
  getSystemPermissionsStatus: () => SystemPermissionsStatus;
  openAccessibilitySettings: () => Promise<SystemPermissionsStatus>;
  computerUseOptions: () => ComputerUseOptions;
  browserExecute?: (agentId: string, command: string, arguments_: Record<string, unknown>) => Promise<unknown>;
};

export function createRuntimeClientRequestHandlers(overrides: Pick<ClientRequestHandlersOptions, 'browserExecute'> = {}): Record<string, ClientRequestHandler> {
  return createClientRequestHandlers({
    openExternal: (url) => shell.openExternal(url),
    getSystemPermissionsStatus,
    openAccessibilitySettings,
    computerUseOptions: () => ({
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      platform: process.platform,
      resourcesPath: process.resourcesPath,
    }),
    ...overrides,
  });
}

export function createClientRequestHandlers(options: ClientRequestHandlersOptions): Record<string, ClientRequestHandler> {
  return {
    [backendMethods.clientExternalOpen]: async (params) => {
      const record = requireRecord(params);
      const url = requireString(record.url, 'url');
      await options.openExternal(url);
      return true;
    },
    [backendMethods.clientBrowserExecute]: async (params) => {
      if (!options.browserExecute) throw new Error('In-app browser tools are unavailable.');
      const input = requireRecord(params);
      return options.browserExecute(requireString(input.agentId, 'agentId'), requireString(input.command, 'command'), requireRecord(input.arguments));
    },
    [backendMethods.clientSystemPermissionsGet]: () => options.getSystemPermissionsStatus(),
    [backendMethods.clientSystemPermissionsAccessibilityOpen]: () => options.openAccessibilitySettings(),
    [backendMethods.clientComputerUseStatusGet]: () => getComputerUseStatus(options.computerUseOptions()),
    [backendMethods.clientComputerUseRequestAccessibility]: () => requestComputerUseAccessibility(options.computerUseOptions()),
    [backendMethods.clientComputerUseStop]: () => {
      stopComputerUseHelper();
      return { stopped: true };
    },
    [backendMethods.clientComputerUseExecute]: async (params) => {
      const input = requireRecord(params);
      if (!isComputerUseCommand(input.command)) {
        throw new Error('Invalid Computer Use command.');
      }
      return executeComputerUseCommand({
        arguments: requireRecord(input.arguments),
        command: input.command,
        options: options.computerUseOptions(),
      });
    },
  };
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Invalid client request params.');
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
