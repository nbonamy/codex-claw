import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoopScheduler } from '../scheduler';

afterEach(() => {
  vi.useRealTimers();
});

describe('LoopScheduler', () => {
  it('runs immediately, repeats on the configured interval, and stops cleanly', async () => {
    vi.useFakeTimers();
    const runLoops = vi.fn().mockResolvedValue(undefined);
    const scheduler = new LoopScheduler({
      intervalMs: 1000,
      runLoops,
    });

    scheduler.start();
    expect(runLoops).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1000);
    expect(runLoops).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runLoops).toHaveBeenCalledTimes(2);
  });

  it('does not overlap checks while a previous run is still active', async () => {
    let resolveRun: () => void = () => undefined;
    const pendingRun = new Promise<void>((resolve) => {
      resolveRun = resolve;
    });
    const runLoops = vi.fn()
      .mockReturnValueOnce(pendingRun)
      .mockResolvedValue(undefined);
    const scheduler = new LoopScheduler({ runLoops });

    const firstCheck = scheduler.check();
    const overlappingCheck = scheduler.check();

    expect(runLoops).toHaveBeenCalledOnce();

    resolveRun();
    await firstCheck;
    await overlappingCheck;

    await scheduler.check();
    expect(runLoops).toHaveBeenCalledTimes(2);
  });

  it('continues future checks after a run fails', async () => {
    const runLoops = vi.fn()
      .mockRejectedValueOnce(new Error('GitHub is unavailable'))
      .mockResolvedValue(undefined);
    const scheduler = new LoopScheduler({ runLoops });

    await scheduler.check();
    await scheduler.check();

    expect(runLoops).toHaveBeenCalledTimes(2);
  });
});
