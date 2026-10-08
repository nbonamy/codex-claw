import { product } from '@workspace/core/product';
import { IdbClient } from './idb-client';
import type { MobileRuntimePaths } from './runtime';
import { IosCompanions } from './ios-companion';
import type { MobileAction, MobileCatalog, MobileDevice } from '@workspace/core/mobile-simulator';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMobileCommand } from './commands';

export type DeviceScreen = { png: Buffer; width: number; height: number; scale: number };
export interface MobileAdapter {
  list(): Promise<MobileCatalog>;
  boot(device: MobileDevice): Promise<void>;
  detach(device: MobileDevice): void;
  screen(device: MobileDevice): Promise<DeviceScreen>;
  perform(device: MobileDevice, action: MobileAction, screen?: DeviceScreen): Promise<void>;
  inspect(device: MobileDevice): Promise<string>;
}

export class NativeMobileAdapter implements MobileAdapter {
  private readonly companions: IosCompanions;
  private readonly clients = new Map<string, IdbClient>();
  constructor(private readonly runtime: MobileRuntimePaths) {
    this.companions = new IosCompanions(runtime.companionPath);
  }
  private readonly adb = executable(
    process.platform === 'win32' ? 'adb.exe' : 'adb',
    [
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT,
      path.join(os.homedir(), 'Library/Android/sdk'),
      path.join(os.homedir(), 'Android/Sdk'),
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android/Sdk') : undefined,
    ]
      .filter((root): root is string => Boolean(root))
      .map((root) => path.join(root, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')),
  );

  async list(): Promise<MobileCatalog> {
    const catalog: MobileCatalog = { devices: [], setup: [] };
    if (process.platform === 'darwin') {
      try {
        const result = JSON.parse(
          (await runMobileCommand('/usr/bin/xcrun', ['simctl', 'list', 'devices', 'available', '-j'])).toString(),
        );
        const bridge =
          existsSync(this.runtime.protoPath) &&
          (await runMobileCommand(this.companions.executable, ['--version']).then(
            () => true,
            () => false,
          ));
        if (!bridge)
          catalog.setup.push({
            platform: 'ios',
            message: `The bundled iOS bridge is unavailable. Update or reinstall ${product.name}, and check macOS/Xcode compatibility.`,
            url: product.websiteUrl,
          });
        else
          for (const [runtime, devices] of Object.entries(
            result.devices as Record<string, { udid: string; name: string; state: string }[]>,
          )) {
            if (!runtime.includes('.iOS-')) continue;
            for (const device of devices)
              catalog.devices.push({
                id: device.udid,
                name: device.name,
                platform: 'ios',
                state: device.state === 'Booted' ? 'booted' : 'shutdown',
              });
          }
        if (bridge && !catalog.devices.some((device) => device.platform === 'ios'))
          catalog.setup.push({
            platform: 'ios',
            message: 'Create an iOS Simulator in Xcode and install its runtime, then refresh.',
            url: 'https://developer.apple.com/documentation/xcode/installing-additional-simulator-runtimes',
          });
      } catch {
        catalog.setup.push({
          platform: 'ios',
          message: 'Install Xcode, select its developer directory, and install an iOS Simulator runtime.',
          url: 'https://developer.apple.com/xcode/',
        });
      }
    }
    try {
      const output = (await runMobileCommand(this.adb, ['devices'])).toString();
      for (const line of output.split('\n')) {
        const match = /^(emulator-\d+)\s+device$/.exec(line.trim());
        if (match) catalog.devices.push({ id: match[1]!, name: match[1]!, platform: 'android', state: 'booted' });
      }
      if (!catalog.devices.some((device) => device.platform === 'android'))
        catalog.setup.push({
          platform: 'android',
          message: 'Start an Android virtual device in Android Studio, then refresh.',
          url: 'https://developer.android.com/studio/run/managing-avds',
        });
    } catch {
      catalog.setup.push({
        platform: 'android',
        message: 'Install Android Studio and SDK Platform Tools, then start an emulator.',
        url: 'https://developer.android.com/studio',
      });
    }
    return catalog;
  }

  async boot(device: MobileDevice): Promise<void> {
    if (device.platform === 'ios' && device.state === 'shutdown') {
      await runMobileCommand('/usr/bin/xcrun', ['simctl', 'boot', device.id]);
      await runMobileCommand('/usr/bin/xcrun', ['simctl', 'bootstatus', device.id, '-b'], 90_000);
    }
    if (device.platform === 'ios') {
      await this.companions.start(device.id);
      const client = new IdbClient(this.companions.address(device.id), this.runtime.protoPath);
      this.clients.set(device.id, client);
      if ((await client.describe()).udid !== device.id) {
        this.detach(device);
        throw new Error('iOS bridge returned a different device. Attach again.');
      }
    }
  }

  detach(device: MobileDevice): void {
    this.clients.get(device.id)?.close();
    this.clients.delete(device.id);
    if (device.platform === 'ios') this.companions.stop(device.id);
  }

  async screen(device: MobileDevice): Promise<DeviceScreen> {
    const png =
      device.platform === 'ios'
        ? await this.ios(device).screenshot()
        : await runMobileCommand(this.adb, ['-s', device.id, 'exec-out', 'screencap', '-p']);
    if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new Error('Device returned an invalid screenshot.');
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    if (!width || !height || width > 10000 || height > 10000) throw new Error('Invalid device screen dimensions.');
    let scale = 1;
    if (device.platform === 'ios') {
      const description = await this.ios(device).describe();
      const dimensions = description.screen_dimensions;
      scale = Number(dimensions?.width) / Number(dimensions?.width_points);
      if (!Number.isFinite(scale) || scale < 1 || scale > 4)
        throw new Error(
          'idb did not return the device screen scale. Update the app before controlling this simulator.',
        );
    }
    return { png, width, height, scale };
  }

  async perform(device: MobileDevice, action: MobileAction, screen?: DeviceScreen): Promise<void> {
    if (device.platform === 'ios') {
      const bridge = this.ios(device);
      const point = (value: number) => Math.floor(value / (screen?.scale ?? 1));
      switch (action.action) {
        case 'tap':
          return bridge.tap(point(action.x), point(action.y));
        case 'swipe':
          return bridge.swipe(
            point(action.x),
            point(action.y),
            point(action.toX),
            point(action.toY),
            action.durationMs / 1000,
          );
        case 'text':
          return bridge.text(action.text);
        case 'button':
          return bridge.button(action.button);
        case 'launch':
          return bridge.launch(action.appId);
      }
    }
    const point = (value: number) => String(Math.floor(value));
    let args: string[];
    switch (action.action) {
      case 'tap':
        args = ['tap', point(action.x), point(action.y)];
        break;
      case 'swipe':
        args = [
          'swipe',
          point(action.x),
          point(action.y),
          point(action.toX),
          point(action.toY),
          String(action.durationMs),
        ];
        break;
      case 'text':
        // ADB input supports ASCII, not a general Unicode IME.
        if (!/^[\x20-\x7e]*$/.test(action.text))
          throw new Error('Device typing supports printable ASCII. Use app-specific tooling for Unicode input.');
        if (action.text.includes('%s')) throw new Error('ADB cannot type a literal %s sequence.');
        args = ['text', shellQuote(action.text.replace(/ /g, '%s'))];
        break;
      case 'button': {
        const keys = { home: '3', back: '4', enter: '66', backspace: '67' };
        args = ['keyevent', keys[action.button]];
        break;
      }
      case 'launch':
        const launch = await runMobileCommand(this.adb, [
          '-s',
          device.id,
          'shell',
          'monkey',
          '-p',
          action.appId,
          '-c',
          'android.intent.category.LAUNCHER',
          '1',
        ]);
        if (!/Events injected:\s*1\b/.test(launch.toString()))
          throw new Error('Android could not launch this app. Check that it is installed and has a launcher activity.');
        return;
    }
    await runMobileCommand(this.adb, ['-s', device.id, 'shell', 'input', ...args]);
  }

  async inspect(device: MobileDevice): Promise<string> {
    if (device.platform === 'ios') return this.ios(device).inspect();
    // No shared guest file: uiautomator writes directly to stdout through /dev/tty.
    const xml = (
      await runMobileCommand(this.adb, ['-s', device.id, 'exec-out', 'uiautomator', 'dump', '/dev/tty'])
    ).toString();
    if (!xml.includes('<hierarchy')) throw new Error('Android accessibility is unavailable.');
    return xml.slice(0, 100_000);
  }

  private ios(device: MobileDevice): IdbClient {
    this.companions.address(device.id); // Reject a dead helper instead of connecting to a stale socket.
    const client = this.clients.get(device.id);
    if (!client) throw new Error('iOS bridge disconnected. Attach again.');
    return client;
  }
}

function executable(name: string, candidates: string[]): string {
  return candidates.find((candidate) => existsSync(candidate)) ?? name;
}
function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
