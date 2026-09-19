import type { AppSnapshot } from '@codex-claw/core/contracts';
import { createMission, updateMission } from '@codex-claw/core/missions';

/** Serializes mission revisions and publishes them only after durable storage succeeds. */
export class MissionService {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly snapshot: AppSnapshot, private readonly persist: (snapshot: AppSnapshot) => Promise<void>) {}

  mutate(action: 'create' | 'update', input: unknown): Promise<void> {
    const operation = this.pending.then(async () => {
      const candidate = { ...this.snapshot, missions: structuredClone(this.snapshot.missions ?? []) };
      if (action === 'create') createMission(candidate, input);
      else updateMission(candidate, input);
      await this.persist(candidate);
      this.snapshot.missions = candidate.missions;
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
