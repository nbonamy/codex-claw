import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('../mobile/commands', () => ({ runMobileCommand: native.run }));
import { NativeMobileAdapter } from '../mobile/adapter';
const ios = { id: 'ios-device', name: 'iPhone', platform: 'ios' as const, state: 'booted' as const };
const android = { id: 'emulator-5554', name: 'Pixel', platform: 'android' as const, state: 'booted' as const };
const png = Buffer.alloc(24);
Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
png.writeUInt32BE(1200,16); png.writeUInt32BE(2400,20);
beforeEach(() => { native.run.mockReset(); });

describe('native mobile adapters', () => {
  it('excludes physical and offline Android devices and reports missing iOS prerequisites', async () => {
    native.run.mockImplementation(async (_file: string, args: string[]) => {
      if (args[0] === 'simctl') throw new Error('no Xcode');
      return Buffer.from('List of devices attached\nemulator-5554\tdevice\nphysical-phone\tdevice\nemulator-5556\toffline\n');
    });
    const result = await new NativeMobileAdapter().list();
    expect(result.devices).toStrictEqual([{ ...android, name: 'emulator-5554' }]);
  });

  it('maps screenshot pixels to iOS points and targets the explicit UDID', async () => {
    native.run.mockResolvedValueOnce(png).mockResolvedValueOnce(Buffer.from(JSON.stringify({ screen_dimensions: { width: 1200, width_points: 400 } }))).mockResolvedValue(Buffer.alloc(0));
    const adapter = new NativeMobileAdapter();
    const screen = await adapter.screen(ios);
    await adapter.perform(ios, { action: 'tap', x: 300, y: 600, width: 1200, height: 2400 }, screen);
    expect(native.run).toHaveBeenLastCalledWith(expect.any(String), ['ui', 'tap', '--udid', 'ios-device', '100', '200']);
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
    expect(native.run).toHaveBeenLastCalledWith(expect.any(String), ['-s', 'emulator-5554', 'shell', 'input', 'text', "'hello%s'\\'';$(touch%s/x)'"]);
    await expect(adapter.perform(android, { action: 'text', text: 'é' })).rejects.toThrow('ASCII');
    await expect(adapter.perform(ios, { action: 'button', button: 'back' })).rejects.toThrow('no Back');
  });
});
