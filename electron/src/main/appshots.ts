import { app } from 'electron';
import autolib, { type Autolib } from 'autolib';
import { executeComputerUseCommand, type ComputerUseOptions } from './computer-use-tools';

export type AppshotCapture = {
  accessibilityText?: string;
  appName?: string;
  imageDataUrl: string;
  windowTitle?: string;
};

export type CaptureAppshotOptions = {
  computerUseOptions?: ComputerUseOptions;
  execute?: typeof executeComputerUseCommand;
  nativeAutomation?: Pick<Autolib, 'getForemostProcessId'>;
};

export async function captureAppshot(options: CaptureAppshotOptions = {}): Promise<AppshotCapture> {
  if (process.platform !== 'darwin' && !options.computerUseOptions) {
    throw new Error('Appshots are currently available only on macOS.');
  }
  const nativeAutomation = options.nativeAutomation ?? autolib;
  const pid = nativeAutomation.getForemostProcessId();
  if (!pid) throw new Error('The frontmost application could not be identified.');

  const execute = options.execute ?? executeComputerUseCommand;
  const helperOptions = options.computerUseOptions ?? {
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    resourcesPath: process.resourcesPath,
  };
  const [screenshot, accessibility] = await Promise.all([
    execute({ command: 'screenshot', arguments: { pid, scope: 'window' }, options: helperOptions }),
    execute({
      command: 'get_app_state',
      arguments: { pid, maxDepth: 16, maxNodes: 3_000, maxTextCharacters: 30_000, showCursor: false },
      options: helperOptions,
    }),
  ]);

  if (!screenshot.ok) {
    if (screenshot.errorCode === 'permission_denied' || screenshot.error.includes('Screen Recording')) {
      await execute({ command: 'request_screen_capture', arguments: {}, options: helperOptions });
      throw new Error('Allow Screen Recording for Codex Claw Computer Use, then try the Appshot again.');
    }
    throw new Error(screenshot.error);
  }

  const screenshotResult = record(screenshot.result);
  const image = record(screenshotResult?.image);
  const dataBase64 = stringValue(image?.dataBase64);
  if (!dataBase64) throw new Error('The frontmost window screenshot was empty.');
  const appResult = record(screenshotResult?.app);
  const windowResult = record(screenshotResult?.window);
  const accessibilityResult = accessibility.ok ? record(accessibility.result) : null;

  return {
    imageDataUrl: `data:${stringValue(image?.mimeType) ?? 'image/png'};base64,${dataBase64}`,
    ...(stringValue(accessibilityResult?.text) ? { accessibilityText: stringValue(accessibilityResult?.text) } : {}),
    ...(stringValue(appResult?.localizedName) ? { appName: stringValue(appResult?.localizedName) } : {}),
    ...(stringValue(windowResult?.title) ? { windowTitle: stringValue(windowResult?.title) } : {}),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
