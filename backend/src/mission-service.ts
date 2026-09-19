import type { AppSnapshot } from '@codex-claw/core/contracts';
import { createMission, updateMission, type Mission } from '@codex-claw/core/missions';

/** Serializes mission revisions and publishes them only after durable storage succeeds. */
export class MissionService {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly snapshot: AppSnapshot, private readonly persist: (snapshot: AppSnapshot) => Promise<void>) {}

  mutate(action: 'create' | 'update', input: unknown): Promise<void> {
    return this.transaction(candidate => {
      if (action === 'create') createMission(candidate, input);
      else updateMission(candidate, input);
    });
  }

  change(id: string, mutate: (mission: Mission) => void): Promise<void> {
    return this.transaction(candidate => {
      const mission = candidate.missions?.find(m => m.id === id);
      if (!mission) throw new Error('Mission not found.');
      mutate(mission);
      mission.revision++;
      mission.updatedAt = new Date().toISOString();
    });
  }

  private transaction(mutate: (candidate: AppSnapshot) => void): Promise<void> {
    const operation = this.pending.then(async () => {
      const candidate = { ...this.snapshot, missions: structuredClone(this.snapshot.missions ?? []) };
      mutate(candidate);
      await this.persist(candidate);
      this.snapshot.missions = candidate.missions;
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
