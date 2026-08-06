import { describe, expect, it, vi } from 'vitest';
import type { KeyMonitorEvent } from 'autolib';
import { AppshotsKeyMonitor } from '../appshots-key-monitor';

function nativeMonitor() {
  let listener: ((event: KeyMonitorEvent) => void) | null = null;
  return {
    emit(keyCode: number) {
      listener?.({ type: 'flagsChanged', keyCode, flags: 0, isRepeat: false });
    },
    startKeyMonitor: vi.fn((callback: (event: KeyMonitorEvent) => void) => {
      listener = callback;
      return 0;
    }),
    stopKeyMonitor: vi.fn(() => {
      listener = null;
      return 0;
    }),
  };
}

describe('AppshotsKeyMonitor', () => {
  it('triggers once when both command keys are held', () => {
    const native = nativeMonitor();
    const trigger = vi.fn();
    const monitor = new AppshotsKeyMonitor({ nativeMonitor: native, platform: 'darwin' });

    expect(monitor.start('command', trigger)).toBe(true);
    native.emit(55);
    native.emit(54);
    native.emit(54);
    native.emit(54);

    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it('supports option and shift pairs', () => {
    const native = nativeMonitor();
    const trigger = vi.fn();
    const monitor = new AppshotsKeyMonitor({ nativeMonitor: native, platform: 'darwin' });

    monitor.start('option', trigger);
    native.emit(58);
    native.emit(61);
    monitor.start('shift', trigger);
    native.emit(56);
    native.emit(60);

    expect(trigger).toHaveBeenCalledTimes(2);
    expect(native.stopKeyMonitor).toHaveBeenCalledTimes(1);
  });

  it('does not load the native monitor when disabled or unsupported', () => {
    const native = nativeMonitor();
    const trigger = vi.fn();
    const monitor = new AppshotsKeyMonitor({ nativeMonitor: native, platform: 'linux' });

    expect(monitor.start('command', trigger)).toBe(true);
    expect(native.startKeyMonitor).not.toHaveBeenCalled();
    monitor.start('none', trigger);
    expect(native.startKeyMonitor).not.toHaveBeenCalled();
  });

  it('reports native monitor startup failures', () => {
    const native = nativeMonitor();
    native.startKeyMonitor.mockReturnValue(3);
    const monitor = new AppshotsKeyMonitor({ nativeMonitor: native, platform: 'darwin' });

    expect(monitor.start('command', vi.fn())).toBe(false);
  });
});
