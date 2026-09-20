import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileMissionSkillStore } from '../mission-skill-store';

describe('Mission skill store', () => {
  it('materializes Claw-owned stage skills without requiring an installed workflow or setup command', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'claw-mission-skills-'));
    try {
      const store = new FileMissionSkillStore(async missionId => path.join(root, missionId));
      const requirements = await store.ensure('mission-test', 'requirements');
      const tickets = await store.ensure('mission-test', 'tickets');
      const implementation = await store.ensure('mission-test', 'implementation');
      const review = await store.ensure('mission-test', 'review');

      expect([requirements, tickets, implementation, review].map(([skill]) => skill?.name)).toStrictEqual([
        'mission-shape-requirements',
        'mission-to-tickets',
        'mission-implement-ticket',
        'mission-review',
      ]);
      expect(await store.ensure('mission-test', 'ship')).toStrictEqual([]);
      const ticketSkill = await readFile(tickets[0]!.path, 'utf8');
      expect(ticketSkill).toContain('codex_claw.upsert-mission-ticket');
      expect(ticketSkill).toContain('without tracker setup');
      expect(ticketSkill).not.toContain('/setup-matt-pocock-skills');
      expect(tickets[0]!.path).toBe(path.join(root, 'mission-test', 'skills', 'mission-to-tickets', 'SKILL.md'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
