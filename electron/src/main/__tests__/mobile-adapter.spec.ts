import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../mobile/ios-companion', () => ({
  IosCompanions: class {
    executable = 'idb_companion';
    address() {
      return '/private/bridge.sock';
    }
    start = vi.fn();
    stop = vi.fn();
  },
}));
vi.mock('../mobile/commands', () => ({ runMobileCommand: native.run }));
import { NativeMobileAdapter } from '../mobile/adapter';
const ios = { id: 'ios-device', name: 'iPhone', platform: 'ios' as const, state: 'booted' as const };
const android = { id: 'emulator-5554', name: 'Pixel', platform: 'android' as const, state: 'booted' as const };
const png = Buffer.alloc(24);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
png.writeUInt32BE(1200, 16);
png.writeUInt32BE(2400, 20);
const hostPlatform = process.platform;
beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin' });
  native.run.mockReset();
});
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: hostPlatform });
});

describe('native mobile adapters', () => {
  it('excludes physical and offline Android devices and reports missing iOS prerequisites', async () => {
    native.run.mockImplementation(async (_file: string, args: string[]) => {
      if (args[0] === 'simctl') throw new Error('no Xcode');
      return Buffer.from(
        'List of devices attached\nemulator-5554\tdevice\nphysical-phone\tdevice\nemulator-5556\toffline\n',
      );
    });
    const result = await new NativeMobileAdapter().list();
    expect(result.devices).toStrictEqual([{ ...android, name: 'emulator-5554' }]);
  });

  it('maps screenshot pixels to iOS points and targets the explicit UDID', async () => {
    native.run
      .mockResolvedValueOnce(png)
      .mockResolvedValueOnce(Buffer.from(JSON.stringify({ screen_dimensions: { width: 1200, width_points: 400 } })))
      .mockResolvedValue(Buffer.alloc(0));
    const adapter = new NativeMobileAdapter();
    const screen = await adapter.screen(ios);
    await adapter.perform(ios, { action: 'tap', x: 300, y: 600, width: 1200, height: 2400 }, screen);
    expect(native.run).toHaveBeenLastCalledWith(expect.any(String), [
      '--companion',
      '/private/bridge.sock',
      'ui',
      'tap',
      '--udid',
      'ios-device',
      '100',
      '200',
    ]);
    await adapter.perform(ios, { action: 'tap', x: 1199, y: 2399, width: 1200, height: 2400 }, screen);
    expect(native.run.mock.lastCall?.[1].slice(-2)).toStrictEqual(['399', '799']);
  });

  it('rejects invalid images and missing iOS scale rather than guessing', async () => {
    const adapter = new NativeMobileAdapter();
    native.run.mockResolvedValueOnce(Buffer.from('bad'));
    await expect(adapter.screen(android)).rejects.toThrow('invalid screenshot');
    native.run.mockResolvedValueOnce(png).mockResolvedValueOnce(Buffer.from('{}'));
    await expect(adapter.screen(ios)).rejects.toThrow('screen scale');
  });

  it('quotes Android text at the guest shell boundary and rejects unsupported Unicode and iOS Back', async () => {
    native.run.mockResolvedValue(Buffer.alloc(0));
    const adapter = new NativeMobileAdapter();
    await adapter.perform(android, { action: 'text', text: "hello ';$(touch /x)" });
    expect(native.run).toHaveBeenLastCalledWith(expect.any(String), [
      '-s',
      'emulator-5554',
      'shell',
      'input',
      'text',
      "'hello%s'\\'';$(touch%s/x)'",
    ]);
    await expect(adapter.perform(android, { action: 'text', text: 'é' })).rejects.toThrow('ASCII');
    await expect(adapter.perform(ios, { action: 'button', button: 'back' })).rejects.toThrow('no Back');
  });
  it('discovers only iOS runtimes, boots a selected simulator, and links missing bridge setup', async () => {
    native.run.mockImplementation(async (file: string, args: string[]) => {
      if (args.includes('devices'))
        return Buffer.from(
          JSON.stringify({
            devices: {
              'com.apple.CoreSimulator.SimRuntime.iOS-27-0': [{ udid: 'phone', name: 'Phone', state: 'Shutdown' }],
              'com.apple.CoreSimulator.SimRuntime.tvOS-27-0': [{ udid: 'tv', name: 'TV', state: 'Booted' }],
            },
          }),
        );
      return Buffer.from('');
    });
    const adapter = new NativeMobileAdapter();
    const catalog = await adapter.list();
    expect(catalog.devices).toStrictEqual([{ id: 'phone', name: 'Phone', state: 'shutdown', platform: 'ios' }]);
    await adapter.boot(catalog.devices[0]!);
    expect(native.run).toHaveBeenCalledWith('/usr/bin/xcrun', ['simctl', 'bootstatus', 'phone', '-b'], 90_000);
    native.run.mockResolvedValueOnce(Buffer.from('{"devices":{}}'));
    expect((await adapter.list()).setup).toContainEqual(
      expect.objectContaining({ platform: 'ios', message: expect.stringContaining('Create an iOS Simulator') }),
    );
    native.run.mockRejectedValueOnce(new Error('Xcode missing')).mockRejectedValueOnce(new Error('adb missing'));
    expect((await adapter.list()).setup.map((item) => item.platform)).toStrictEqual(['ios', 'android']);
  });

  it('encodes iOS gestures, keyboard, foreground launch and accessibility on the private connection', async () => {
    native.run.mockResolvedValue(Buffer.from('[]'));
    const adapter = new NativeMobileAdapter();
    const screen = { png, width: 1200, height: 2400, scale: 3 };
    await adapter.perform(
      ios,
      { action: 'swipe', x: 300, y: 600, toX: 600, toY: 900, width: 1200, height: 2400, durationMs: 500 },
      screen,
    );
    expect(native.run.mock.lastCall?.[1]).toStrictEqual([
      '--companion',
      '/private/bridge.sock',
      'ui',
      'swipe',
      '--udid',
      'ios-device',
      '100',
      '200',
      '200',
      '300',
      '--duration',
      '0.5',
    ]);
    await adapter.perform(ios, { action: 'text', text: '--hello' });
    expect(native.run.mock.lastCall?.[1]).toStrictEqual([
      '--companion',
      '/private/bridge.sock',
      'ui',
      'text',
      '--udid',
      'ios-device',
      '--',
      '--hello',
    ]);
    await adapter.perform(ios, { action: 'button', button: 'home' });
    expect(native.run.mock.lastCall?.[1]).toContain('HOME');
    await adapter.perform(ios, { action: 'button', button: 'backspace' });
    expect(native.run.mock.lastCall?.[1]).toContain('42');
    await adapter.perform(ios, { action: 'launch', appId: 'com.test.app' });
    expect(native.run.mock.lastCall?.[1]).toStrictEqual([
      '--companion',
      '/private/bridge.sock',
      'launch',
      '--udid',
      'ios-device',
      '--foreground-if-running',
      'com.test.app',
    ]);
    expect(await adapter.inspect(ios)).toBe('[]');
    adapter.detach(ios);
  });

  it('uses Android pixels and milliseconds, launches packages, and rejects non-XML accessibility output', async () => {
    native.run.mockResolvedValue(Buffer.from('<hierarchy rotation="0"></hierarchy>'));
    const adapter = new NativeMobileAdapter();
    await adapter.perform(android, {
      action: 'swipe',
      x: 300,
      y: 600,
      toX: 600,
      toY: 900,
      width: 1200,
      height: 2400,
      durationMs: 500,
    });
    expect(native.run.mock.lastCall?.[1]).toStrictEqual([
      '-s',
      'emulator-5554',
      'shell',
      'input',
      'swipe',
      '300',
      '600',
      '600',
      '900',
      '500',
    ]);
    await adapter.perform(android, { action: 'button', button: 'back' });
    expect(native.run.mock.lastCall?.[1]).toStrictEqual(['-s', 'emulator-5554', 'shell', 'input', 'keyevent', '4']);
    native.run.mockResolvedValueOnce(Buffer.from('Events injected: 1'));
    await adapter.perform(android, { action: 'launch', appId: 'com.test.app' });
    expect(native.run.mock.lastCall?.[1]).toStrictEqual([
      '-s',
      'emulator-5554',
      'shell',
      'monkey',
      '-p',
      'com.test.app',
      '-c',
      'android.intent.category.LAUNCHER',
      '1',
    ]);
    native.run.mockResolvedValueOnce(Buffer.from('No activities found to run, monkey aborted.'));
    await expect(adapter.perform(android, { action: 'launch', appId: 'com.missing.app' })).rejects.toThrow(
      'could not launch',
    );
    expect(await adapter.inspect(android)).toContain('<hierarchy');
    native.run.mockResolvedValueOnce(Buffer.from('ERROR: could not dump'));
    await expect(adapter.inspect(android)).rejects.toThrow('unavailable');
  });
});
