import assert from "node:assert/strict";
import test from "node:test";
import {
  alignFilmToNarration,
  frameMap,
  sourceFrameAt,
} from "./film-timing.mjs";

const film = {
  duration: 4,
  cues: [
    { start: 0.5, text: "First cue" },
    { start: 2, text: "Second cue" },
  ],
};
const narration = {
  duration: 5,
  cues: [
    { start: 0.1, spokenEnd: 2.1, text: "First cue" },
    { start: 2.8, spokenEnd: 4.7, text: "Second cue" },
  ],
};

// Protects cue/scene synchronization during exports and out-of-order Studio seeks.
test("narrated frames follow measured cues and retain the opening and ending", () => {
  const timed = alignFilmToNarration({
    film,
    narration,
    narrationOffset: 0.5,
    outro: 0.5,
  });
  assert.equal(timed.duration, 6);
  assert.deepEqual(timed.cues, [
    { text: "First cue", start: 0.6, spokenEnd: 2.6, end: 3.3 },
    { text: "Second cue", start: 3.3, spokenEnd: 5.2, end: 6 },
  ]);
  const map = frameMap(film, timed);
  // Jump backwards as well as forwards; seeking must not depend on playback history.
  for (const [target, source] of [
    [79, 48],
    [0, 0],
    [144, 96],
    [14, 12],
    [142, 94.52307692307693],
    [46.5, 30],
  ]) {
    assert.ok(Math.abs(sourceFrameAt(target, map) - source) < 1e-9);
  }
  assert.equal(sourceFrameAt(200, map), 96);
  assert.equal(sourceFrameAt(-5, map), 0);
});

// Protects existing exports from stale copy, invalid alignment, and collapsed intervals.
test("unsafe narration or cue timing is rejected before rendering", () => {
  for (const changed of [
    { ...narration, cues: [] },
    { ...narration, duration: NaN },
    {
      ...narration,
      cues: [{ ...narration.cues[0], text: "Stale copy" }, narration.cues[1]],
    },
    {
      ...narration,
      cues: [narration.cues[0], { ...narration.cues[1], start: 1 }],
    },
    {
      ...narration,
      cues: [narration.cues[0], { ...narration.cues[1], spokenEnd: 6 }],
    },
  ])
    assert.throws(() => alignFilmToNarration({ film, narration: changed }));
  assert.throws(
    () =>
      frameMap(
        { ...film, cues: [{ ...film.cues[0], start: 0 }, film.cues[1]] },
        alignFilmToNarration({ film, narration }),
      ),
    /increasing/,
  );
  assert.throws(
    () => alignFilmToNarration({ film, narration, narrationOffset: -1 }),
    /nonnegative/,
  );
  assert.throws(
    () =>
      frameMap(film, {
        ...film,
        duration: 30,
        cues: [{ start: 0.5 }, { start: 20 }],
      }),
    /unexpected timing/,
  );
});
