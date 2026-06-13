import { describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/shared/snapshot';
import { AgentActivityPowerSaveBlocker } from '../agent-activity-power-save-blocker';

describe('AgentActivityPowerSaveBlocker', () => {
  it('starts a display sleep blocker while any agent is active', () => {
    const start = vi.fn().mockReturnValue(42);
    const stop = vi.fn();
    const blocker = new AgentActivityPowerSaveBlocker({ start, stop });
    const snapshot = createInitialSnapshot();

    snapshot.agents[0].status = { type: 'working' };

    blocker.sync(snapshot);
    blocker.sync(snapshot);

    expect(start).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith('prevent-display-sleep');
    expect(stop).not.toHaveBeenCalled();
  });

  it('stops the blocker when agents become idle or the setting is disabled', () => {
    const start = vi.fn().mockReturnValue(42);
    const stop = vi.fn();
    const blocker = new AgentActivityPowerSaveBlocker({ start, stop });
    const snapshot = createInitialSnapshot();

    snapshot.agents[0].status = { type: 'working' };
    blocker.sync(snapshot);

    snapshot.agents[0].status = { type: 'idle' };
    blocker.sync(snapshot);

    snapshot.agents[0].status = { type: 'working' };
    blocker.sync(snapshot);
    snapshot.general.preventSleepWhenAgentsRun = false;
    blocker.sync(snapshot);

    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenNthCalledWith(1, 42);
    expect(stop).toHaveBeenNthCalledWith(2, 42);
  });
});
