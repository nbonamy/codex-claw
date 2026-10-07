import { describe, expect, it } from 'vitest';
import { createInitialSnapshot } from '@workspace/core/snapshot';
import { appDeveloperInstructions } from '../agent-prompts';

describe('appDeveloperInstructions', () => {
  it('supplies the inline HTML authoring contract without a capability opt-in', () => {
    const agent = createInitialSnapshot().agents[0]!;
    const instructions = appDeveloperInstructions(agent);

    // These delimiters and line boundaries are consumed by the SDK renderer,
    // unlike the surrounding policy prose, which can be freely reworded.
    expect(instructions).toMatch(/^<artifact title="[^"]+">\n<!doctype html><html>[\s\S]*?<\/html>\n<\/artifact>$/m);
  });
});
