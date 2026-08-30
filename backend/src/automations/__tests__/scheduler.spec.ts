import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationScheduler } from '../scheduler';

afterEach(() => {
  vi.useRealTimers();
});

describe('AutomationScheduler', () => {
  it('runs immediately, repeats on the configured interval, and stops cleanly', async () => {
    vi.useFakeTimers();
    const runAutomations = vi.fn().mockResolvedValue(undefined);
    const scheduler = new AutomationScheduler({
      intervalMs: 1000,
      runAutomations,
    });

    scheduler.start();
    expect(runAutomations).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1000);
    expect(runAutomations).toHaveBeenCalledTimes(2);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(runAutomations).toHaveBeenCalledTimes(2);
  });

  it('does not overlap checks while a previous run is still active', async () => {
    let resolveRun: () => void = () => undefined;
    const pendingRun = new Promise<void>((resolve) => {
      resolveRun = resolve;
    });
    const runAutomations = vi.fn()
      .mockReturnValueOnce(pendingRun)
      .mockResolvedValue(undefined);
    const scheduler = new AutomationScheduler({ runAutomations });

    const firstCheck = scheduler.check();
    const overlappingCheck = scheduler.check();

    expect(runAutomations).toHaveBeenCalledOnce();

    resolveRun();
    await firstCheck;
    await overlappingCheck;

    await scheduler.check();
    expect(runAutomations).toHaveBeenCalledTimes(2);
  });

  it('continues future checks after a run fails', async () => {
    const runAutomations = vi.fn()
      .mockRejectedValueOnce(new Error('GitHub is unavailable'))
      .mockResolvedValue(undefined);
    const onError = vi.fn();
    const scheduler = new AutomationScheduler({ runAutomations, onError });

    await scheduler.check();
    await scheduler.check();

    expect(runAutomations).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'GitHub is unavailable' }));
  });
});
