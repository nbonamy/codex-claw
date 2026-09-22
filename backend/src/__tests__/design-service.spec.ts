import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialSnapshot } from '@codex-claw/core/snapshot';
import { DesignService } from '../design-service';

let temporaryDirectory: string | null = null;

afterEach(async () => {
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = null;
});

describe('DesignService', () => {
  it('runs the durable suggest, add, select, read, and replace workflow', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0];
    agent.backendSession = { kind: 'codex', threadId: 'thread-design' };
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-design-'));
    const generatedImagesRoot = path.join(temporaryDirectory, 'generated_images');
    await mkdir(generatedImagesRoot);
    await writeFile(path.join(generatedImagesRoot, 'system.png'), Buffer.from('diagram'));
    const persist = vi.fn().mockResolvedValue(undefined);
    const publish = vi.fn();
    let sequence = 0;
    const service = new DesignService({
      snapshot,
      generatedImagesRoot,
      createId: prefix => `${prefix}-${++sequence}`,
      now: () => new Date('2026-09-21T12:00:00.000Z'),
      persist,
      publish,
    });

    const entered = await service.enter(agent.id);
    expect(entered.created).toBe(true);
    expect(entered.design.conversationRef).toStrictEqual({ backend: 'codex', threadId: 'thread-design' });

    const suggested = await service.suggest(agent.id, [
      { title: 'System map', description: 'Show services and data movement.' },
      { title: 'Request sequence', description: 'Show the critical request path.' },
    ]);
    const suggestionId = suggested.suggestions[0].id;
    const added = await service.add(agent.id, {
      title: 'System map',
      suggestionId,
      content: { kind: 'mermaid', source: 'flowchart LR\n  A --> B' },
    });
    await service.add(agent.id, {
      title: 'Generated concept',
      content: { kind: 'image', generatedImagePath: 'system.png', alt: 'A system concept diagram' },
    });
    await service.select(agent.id, added.diagramId);
    const replaced = await service.replace(agent.id, {
      diagramId: added.diagramId,
      expectedRevision: 1,
      title: 'System map, revised',
      content: { kind: 'svg', source: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>' },
    });

    expect(replaced.revision).toBe(2);
    expect(service.get(agent.id, added.diagramId).diagram).toMatchObject({
      title: 'System map, revised',
      revision: 2,
      content: { kind: 'svg' },
    });
    expect(agent.design?.suggestions[0].diagramId).toBe(added.diagramId);
    const image = agent.design?.diagrams.find(diagram => diagram.content.kind === 'image');
    await expect(service.readAsset(agent.id, image!.id)).resolves.toMatchObject({
      mimeType: 'image/png',
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/u),
    });
    expect(persist).toHaveBeenCalledTimes(6);
    expect(publish).toHaveBeenCalledTimes(6);
  });

  it('rejects stale replacement revisions and generated images outside the owned folder', async () => {
    const snapshot = createInitialSnapshot();
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-design-'));
    const generatedImagesRoot = path.join(temporaryDirectory, 'generated_images');
    await mkdir(generatedImagesRoot);
    const outside = path.join(temporaryDirectory, 'outside.png');
    await writeFile(outside, Buffer.from('outside'));
    const service = new DesignService({
      snapshot,
      generatedImagesRoot,
      persist: () => Promise.resolve(),
      publish: () => undefined,
    });
    await service.enter(snapshot.agents[0].id);
    const added = await service.add(snapshot.agents[0].id, {
      title: 'Current',
      content: { kind: 'mermaid', source: 'flowchart LR\n A --> B' },
    });

    await expect(service.replace(snapshot.agents[0].id, {
      diagramId: added.diagramId,
      expectedRevision: 9,
      title: 'Stale',
      content: { kind: 'mermaid', source: 'flowchart LR\n A --> C' },
    })).rejects.toThrow('revision 1');
    await expect(service.add(snapshot.agents[0].id, {
      title: 'Outside',
      content: { kind: 'image', generatedImagePath: outside, alt: 'Outside image' },
    })).rejects.toThrow('inside the Codex Claw generated-images folder');
  });

  it('does not expose a Design session after its owning conversation is released', async () => {
    const snapshot = createInitialSnapshot();
    const agent = snapshot.agents[0];
    agent.backendSession = { kind: 'codex', threadId: 'thread-design' };
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'codex-claw-design-'));
    const generatedImagesRoot = path.join(temporaryDirectory, 'generated_images');
    await mkdir(generatedImagesRoot);
    const service = new DesignService({
      snapshot,
      generatedImagesRoot,
      persist: () => Promise.resolve(),
      publish: () => undefined,
    });

    await service.enter(agent.id);
    expect(service.contextForAgent(agent.id)).toBeDefined();

    delete agent.backendSession;

    expect(service.contextForAgent(agent.id)).toBeUndefined();
  });
});
