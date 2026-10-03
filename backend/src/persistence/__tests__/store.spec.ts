import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEmptySnapshot, createInitialSnapshot } from '@codex-claw/core/snapshot';
import type { AppSnapshot } from '@codex-claw/core/contracts';
import type { Visualization } from '@codex-claw/core/visualize';
import { persistedStateFromSnapshot, snapshotFromPersistedState } from '../../state-persistence';
import { AppStateStore } from '../store';
import { StoreFormatError } from '../store-format';

const visualization = (id: string): Visualization => ({ id, title: id, content: { kind: 'mermaid', source: 'flowchart LR; A --> B' }, createdAt: '2026-09-21T12:00:00.000Z', updatedAt: '2026-09-21T12:00:00.000Z' });

let home = '';
beforeEach(async () => { home = await mkdtemp(path.join(os.tmpdir(), 'claw-store-')); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

const file = (...segments: string[]) => path.join(home, ...segments);
const exists = (...segments: string[]) => stat(file(...segments)).then(() => true, () => false);
const readJson = async (...segments: string[]) => JSON.parse(await readFile(file(...segments), 'utf8')) as { schemaVersion: number; data: Record<string, unknown> };

function snapshotWithVisualizations(): AppSnapshot {
  const snapshot = createInitialSnapshot();
  snapshot.repositoryVisualizations = { '/projects/claw': [visualization('visualization-a'), visualization('visualization-b')] };
  return snapshot;
}

describe('AppStateStore', () => {
  it('starts empty without creating files, then writes the versioned layout on the first save', async () => {
    const store = new AppStateStore(home);
    expect(await store.load()).toStrictEqual(createEmptySnapshot());
    expect(await readdir(home)).toStrictEqual([]);

    await store.save(snapshotWithVisualizations());

    expect((await readdir(home)).sort()).toStrictEqual(['roster.json', 'settings.json', 'visualizations']);
    expect((await readJson('roster.json')).schemaVersion).toBe(1);
    expect((await readJson('settings.json')).schemaVersion).toBe(1);
    const [directory] = await readdir(file('visualizations'));
    expect(directory).toMatch(/^claw-[0-9a-f]{8}$/);
    expect((await readdir(file('visualizations', directory!))).sort()).toStrictEqual(['visualization-a.json', 'visualization-b.json']);
  });

  it('restores the saved snapshot in a fresh process', async () => {
    const snapshot = snapshotWithVisualizations();
    await new AppStateStore(home).save(snapshot);

    const restored = await new AppStateStore(home).load();

    const expected = snapshotFromPersistedState(persistedStateFromSnapshot(snapshot));
    // The selection is stored once, on the active team.
    expected.teams[0]!.activeAgentId = expected.activeAgentId ?? undefined;
    expect(restored).toStrictEqual(expected);
    expect(restored.repositoryVisualizations?.['/projects/claw']?.map((item) => item.id)).toStrictEqual(['visualization-a', 'visualization-b']);
  });

  it('rewrites only the files whose content changed', async () => {
    const snapshot = snapshotWithVisualizations();
    const store = new AppStateStore(home);
    await store.save(snapshot);
    const [directory] = await readdir(file('visualizations'));
    const visualizationFile = file('visualizations', directory!, 'visualization-a.json');
    const past = new Date('2020-01-01T00:00:00.000Z');
    await utimes(visualizationFile, past, past);

    snapshot.agents[0]!.name = 'Renamed';
    await store.save(snapshot);

    expect((await stat(visualizationFile)).mtime).toStrictEqual(past);
    expect(JSON.stringify(await readJson('roster.json'))).toContain('Renamed');
  });

  it('removes a deleted visualization and its empty repository folder as part of the save', async () => {
    const snapshot = snapshotWithVisualizations();
    const store = new AppStateStore(home);
    await store.save(snapshot);
    const [directory] = await readdir(file('visualizations'));

    snapshot.repositoryVisualizations = { '/projects/claw': [visualization('visualization-b')] };
    await store.save(snapshot);
    expect(await readdir(file('visualizations', directory!))).toStrictEqual(['visualization-b.json']);

    snapshot.repositoryVisualizations = {};
    await store.save(snapshot);
    expect(await exists('visualizations', directory!)).toBe(false);
  });

  it('keeps the latest of overlapping saves', async () => {
    const store = new AppStateStore(home);
    const first = createInitialSnapshot();
    first.agents[0]!.name = 'First';
    const second = createInitialSnapshot();
    second.agents[0]!.name = 'Second';

    await Promise.all([store.save(first), store.save(second)]);

    expect((await new AppStateStore(home).load()).agents[0]!.name).toBe('Second');
  });

  it('refuses a roster written by a newer build and leaves it untouched', async () => {
    await new AppStateStore(home).save(createInitialSnapshot());
    const newer = JSON.stringify({ schemaVersion: 2, writtenBy: 'clawd 9.9.9', data: {} });
    await writeFile(file('roster.json'), newer);

    await expect(new AppStateStore(home).load()).rejects.toThrowError(/clawd 9\.9\.9/);
    expect(await readFile(file('roster.json'), 'utf8')).toBe(newer);
  });

  it('stops on a corrupt roster instead of starting empty', async () => {
    await new AppStateStore(home).save(createInitialSnapshot());
    await writeFile(file('roster.json'), '{"schemaVersion": 1, "data": {"teams": "nope"}}');

    await expect(new AppStateStore(home).load()).rejects.toThrowError(StoreFormatError);
    await writeFile(file('roster.json'), '{ truncated');
    await expect(new AppStateStore(home).load()).rejects.toThrowError(/not valid JSON/);
  });

  it('refuses a layout with a missing file rather than guessing', async () => {
    await new AppStateStore(home).save(createInitialSnapshot());
    await rm(file('settings.json'));
    await expect(new AppStateStore(home).load()).rejects.toThrowError(/settings\.json is missing/);
    await new AppStateStore(home).save(createInitialSnapshot()).catch(() => undefined);
    await rm(file('roster.json'));
    await expect(new AppStateStore(home).load()).rejects.toThrowError(/roster\.json/);
  });

  it('skips an unreadable visualization without deleting it', async () => {
    const snapshot = snapshotWithVisualizations();
    const logs: string[] = [];
    await new AppStateStore(home).save(snapshot);
    const [directory] = await readdir(file('visualizations'));
    const damaged = file('visualizations', directory!, 'visualization-a.json');
    await writeFile(damaged, 'half a file');

    const store = new AppStateStore(home, { log: (message) => logs.push(message) });
    const restored = await store.load();
    await store.save(restored);

    expect(restored.repositoryVisualizations?.['/projects/claw']?.map((item) => item.id)).toStrictEqual(['visualization-b']);
    expect(logs.join('\n')).toContain('visualization-a.json');
    expect(await readFile(damaged, 'utf8')).toBe('half a file');
  });
});

describe('migrating the legacy state.json', () => {
  function legacyState() {
    const snapshot = snapshotWithVisualizations();
    snapshot.agents[0]!.statusText = 'Done';
    snapshot.agents[0]!.plan = { threadId: 't', turnId: 'turn', kind: 'execution', status: 'completed', explanation: '', steps: [], markdown: '- [x] done', updatedAt: '2026-10-01T00:00:00.000Z' };
    const desktopOrder = [...snapshot.teams[0]!.agentIds].reverse();
    return {
      snapshot,
      text: JSON.stringify({
        ...persistedStateFromSnapshot(snapshot),
        clientPreferences: { desktop: { activeAgentId: desktopOrder[0], activeTeamId: snapshot.teams[0]!.id, agentOrderByTeam: { [snapshot.teams[0]!.id]: desktopOrder }, theme: { mode: 'dark' } } },
      }),
      desktopOrder,
    };
  }

  it('backs up the original, writes the new layout, and replaces state.json with a marker old builds cannot parse', async () => {
    const { text, desktopOrder } = legacyState();
    await writeFile(file('state.json'), text);
    const logs: string[] = [];

    const migrated = await new AppStateStore(home, { log: (message) => logs.push(message) }).load();

    const [backup] = await readdir(file('backups'));
    expect(backup).toMatch(/^state-v0-.*\.json$/);
    expect(await readFile(file('backups', backup!), 'utf8')).toBe(text);
    expect((await readdir(home)).sort()).toStrictEqual(['backups', 'roster.json', 'settings.json', 'state.json', 'visualizations']);
    const marker = await readFile(file('state.json'), 'utf8');
    expect(() => JSON.parse(marker)).toThrow();
    expect(logs.join('\n')).toContain(backup);
    expect(migrated.teams[0]!.agentIds).toStrictEqual(desktopOrder);
    expect(migrated.activeAgentId).toBe(desktopOrder[0]);
    expect(migrated.theme.mode).toBe('dark');
    expect(migrated.agents[0]!.statusText).toBe('Done');
    expect(migrated.agents[0]).not.toHaveProperty('plan');
    expect(migrated.clientPreferences).toBeUndefined();
    expect(migrated.repositoryVisualizations?.['/projects/claw']).toHaveLength(2);
    expect(await new AppStateStore(home).load()).toStrictEqual(migrated);
  });

  it('does not migrate twice, and a retired state.json without a roster is an error', async () => {
    await writeFile(file('state.json'), legacyState().text);
    await new AppStateStore(home).load();
    const backups = await readdir(file('backups'));

    await new AppStateStore(home).load();
    expect(await readdir(file('backups'))).toStrictEqual(backups);

    await rm(file('roster.json'));
    await expect(new AppStateStore(home).load()).rejects.toThrowError(/retired but roster\.json is missing/);
  });

  it('aborts before touching anything when the backup cannot be verified or written', async () => {
    const { text } = legacyState();
    await writeFile(file('state.json'), text);
    await writeFile(file('backups'), 'a file where the backups folder should be');

    await expect(new AppStateStore(home).load()).rejects.toThrowError();

    expect(await readFile(file('state.json'), 'utf8')).toBe(text);
    expect(await exists('roster.json')).toBe(false);
    expect(await exists('settings.json')).toBe(false);
  });

  it('redoes an interrupted migration from state.json and keeps the previous layout in backups', async () => {
    const { text } = legacyState();
    await writeFile(file('state.json'), text);
    await writeFile(file('roster.json'), '{"schemaVersion": 1, "data": "partial"}');
    await mkdir(file('visualizations', 'stale-00000000'), { recursive: true });
    await writeFile(file('visualizations', 'stale-00000000', 'visualization-stale.json'), '{}');

    const migrated = await new AppStateStore(home).load();

    expect(migrated.repositoryVisualizations?.['/projects/claw']).toHaveLength(2);
    const archived = (await readdir(file('backups'))).find((name) => name.startsWith('layout-before-migration-'));
    expect(archived).toBeDefined();
    expect(await readFile(file('backups', archived!, 'roster.json'), 'utf8')).toContain('partial');
    expect(await exists('visualizations', 'stale-00000000')).toBe(false);
  });

  it('refuses a legacy file that is not JSON', async () => {
    await writeFile(file('state.json'), '{ "teams": ');
    await expect(new AppStateStore(home).load()).rejects.toThrowError(/not valid JSON/);
    expect(await exists('roster.json')).toBe(false);
  });
});
