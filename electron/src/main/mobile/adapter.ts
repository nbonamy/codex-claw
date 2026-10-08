import type { MobileAction, MobileCatalog, MobileDevice } from '@workspace/core/mobile-simulator';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMobileCommand } from './commands';

export type DeviceScreen = { png: Buffer; width: number; height: number; scale: number };
export interface MobileAdapter {
  list(): Promise<MobileCatalog>;
  boot(device: MobileDevice): Promise<void>;
  screen(device: MobileDevice): Promise<DeviceScreen>;
  perform(device: MobileDevice, action: MobileAction, screen?: DeviceScreen): Promise<void>;
  inspect(device: MobileDevice): Promise<string>;
}

export class NativeMobileAdapter implements MobileAdapter {
  private readonly adb = executable('adb', [path.join(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? path.join(os.homedir(), 'Library/Android/sdk'), 'platform-tools/adb')]);
  private readonly idb = executable('idb', [process.env.APP_MOBILE_IDB_PATH ?? '', '/opt/homebrew/bin/idb', '/usr/local/bin/idb']);

  async list(): Promise<MobileCatalog> {
    const catalog: MobileCatalog = { devices: [], setup: [] };
    if (process.platform === 'darwin') {
      try {
        const result = JSON.parse((await runMobileCommand('/usr/bin/xcrun', ['simctl', 'list', 'devices', 'available', '-j'])).toString());
        const bridge = await runMobileCommand(this.idb, ['--help']).then(() => true, () => false);
        if (!bridge) catalog.setup.push({ platform: 'ios', message: 'Install Meta idb for iOS input and accessibility (Xcode 27 requires a current build).', url: 'https://fbidb.io/docs/installation' });
        else for (const [runtime, devices] of Object.entries(result.devices as Record<string, { udid: string; name: string; state: string }[]>)) {
          if (!runtime.includes('.iOS-')) continue;
          for (const device of devices) catalog.devices.push({ id: device.udid, name: device.name, platform: 'ios', state: device.state === 'Booted' ? 'booted' : 'shutdown' });
        }
      } catch {
        catalog.setup.push({ platform: 'ios', message: 'Install Xcode, select its developer directory, and install an iOS Simulator runtime.', url: 'https://developer.apple.com/xcode/' });
      }
    }
    try {
      const output = (await runMobileCommand(this.adb, ['devices'])).toString();
      for (const line of output.split('\n')) {
        const match = /^(emulator-\d+)\s+device$/.exec(line.trim());
        if (match) catalog.devices.push({ id: match[1]!, name: match[1]!, platform: 'android', state: 'booted' });
      }
      if (!catalog.devices.some(device => device.platform === 'android')) catalog.setup.push({ platform: 'android', message: 'Start an Android virtual device in Android Studio, then refresh.', url: 'https://developer.android.com/studio/run/managing-avds' });
    } catch {
      catalog.setup.push({ platform: 'android', message: 'Install Android Studio and SDK Platform Tools, then start an emulator.', url: 'https://developer.android.com/studio' });
    }
    return catalog;
  }

  async boot(device: MobileDevice): Promise<void> {
    if (device.platform === 'ios' && device.state === 'shutdown') {
      await runMobileCommand('/usr/bin/xcrun', ['simctl', 'boot', device.id]);
      await runMobileCommand('/usr/bin/xcrun', ['simctl', 'bootstatus', device.id, '-b'], 90_000);
    }
  }

  async screen(device: MobileDevice): Promise<DeviceScreen> {
    const png = device.platform === 'ios'
      ? await this.ios(device, ['screenshot', '-'])
      : await runMobileCommand(this.adb, ['-s', device.id, 'exec-out', 'screencap', '-p']);
    if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Device returned an invalid screenshot.');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    if (!width || !height || width > 10000 || height > 10000) throw new Error('Invalid device screen dimensions.');
    let scale = 1;
    if (device.platform === 'ios') {
      const description = JSON.parse((await this.ios(device, ['describe', '--json'])).toString());
      const dimensions = description.screen_dimensions;
      scale = dimensions?.width / dimensions?.width_points;
      if (!Number.isFinite(scale) || scale < 1 || scale > 4) throw new Error('idb did not return the device screen scale. Update idb before controlling this simulator.');
    }
    return { png, width, height, scale };
  }

  async perform(device: MobileDevice, action: MobileAction, screen?: DeviceScreen): Promise<void> {
    const ios = device.platform === 'ios';
    const point = (value: number) => String(Math.round(value / (screen?.scale ?? 1)));
    let args: string[];
    switch (action.action) {
      case 'tap': args = ['tap', point(action.x), point(action.y)]; break;
      case 'swipe': args = ['swipe', point(action.x), point(action.y), point(action.toX), point(action.toY), ...(ios ? ['--duration', String(action.durationMs / 1000)] : [String(action.durationMs)])]; break;
      case 'text':
        // adb input and idb HID text support ASCII, not a general Unicode IME.
        if (!/^[\x20-\x7e]*$/.test(action.text)) throw new Error('Device typing supports printable ASCII. Use app-specific tooling for Unicode input.');
        args = ['text', ...(ios ? ['--', action.text] : [shellQuote(action.text.replace(/%s/g, '%\\s').replace(/ /g, '%s'))])]; break;
      case 'button': {
        if (ios && action.button === 'back') throw new Error('iOS has no Back button.');
        const keys = { home: '3', back: '4', enter: '66', backspace: '67' };
        args = ios ? action.button === 'home' ? ['ui', 'button', 'HOME'] : ['ui', 'key', action.button === 'enter' ? '40' : '42'] : ['keyevent', keys[action.button]];
        break;
      }
      case 'launch':
        if (ios) { await this.ios(device, ['launch', '--foreground-if-running', action.appId]); return; }
        await runMobileCommand(this.adb, ['-s', device.id, 'shell', 'monkey', '-p', action.appId, '-c', 'android.intent.category.LAUNCHER', '1']); return;
    }
    if (ios) await this.ios(device, args[0] === 'ui' ? args : ['ui', ...args]);
    else await runMobileCommand(this.adb, ['-s', device.id, 'shell', 'input', ...args]);
  }

  async inspect(device: MobileDevice): Promise<string> {
    if (device.platform === 'ios') return (await this.ios(device, ['ui', 'describe-all', '--json'])).toString().slice(0, 100_000);
    // No shared guest file: uiautomator writes directly to stdout through /dev/tty.
    return (await runMobileCommand(this.adb, ['-s', device.id, 'exec-out', 'uiautomator', 'dump', '/dev/tty'])).toString().slice(0, 100_000);
  }

  private ios(device: MobileDevice, args: string[]) {
    const depth = args[0] === 'ui' ? 2 : 1;
    return runMobileCommand(this.idb, [...(process.env.APP_MOBILE_COMPANION_PATH ? ['--companion-path', process.env.APP_MOBILE_COMPANION_PATH] : []), ...args.slice(0, depth), '--udid', device.id, ...args.slice(depth)]);
  }
}

function executable(name: string, candidates: string[]): string {
  return candidates.find(candidate => existsSync(candidate)) ?? name;
}
function shellQuote(value: string): string { return "'" + value.replace(/'/g, "'\\''") + "'"; }
