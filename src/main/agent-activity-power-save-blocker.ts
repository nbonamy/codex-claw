import { powerSaveBlocker } from 'electron';
import type { AgentStatus, AppSnapshot } from '../shared/contracts';

type PowerSaveBlockerDependencies = {
  start: (type: 'prevent-display-sleep') => number;
  stop: (id: number) => void;
};

function defaultDependencies(): PowerSaveBlockerDependencies {
  return {
    start: (type) => powerSaveBlocker?.start?.(type) ?? -1,
    stop: (id) => powerSaveBlocker?.stop?.(id),
  };
}

export class AgentActivityPowerSaveBlocker {
  private blockerId: number | null = null;

  constructor(private readonly dependencies: PowerSaveBlockerDependencies = defaultDependencies()) {}

  sync(snapshot: AppSnapshot): void {
    const shouldBlockSleep = snapshot.general.preventSleepWhenAgentsRun &&
      snapshot.agents.some((agent) => isActiveStatus(agent.status));

    if (shouldBlockSleep && this.blockerId === null) {
      this.blockerId = this.dependencies.start('prevent-display-sleep');
      return;
    }

    if (!shouldBlockSleep) {
      this.stop();
    }
  }

  stop(): void {
    if (this.blockerId === null) {
      return;
    }

    this.dependencies.stop(this.blockerId);
    this.blockerId = null;
  }
}

function isActiveStatus(status: AgentStatus): boolean {
  return status.type === 'starting' || status.type === 'working' || status.type === 'awaitingInput';
}
