import { FPS } from "./film-catalog.mjs";

const fps = FPS;

export function alignFilmToNarration({
  film,
  narration,
  narrationOffset = 0.5,
  outro = 0.5,
}) {
  if (
    !Number.isFinite(narrationOffset) ||
    narrationOffset < 0 ||
    !Number.isFinite(outro) ||
    outro < 0
  )
    throw new Error("Narration offset and outro must be nonnegative.");
  if (
    !narration ||
    narration.cues?.length !== film.cues.length ||
    !Number.isFinite(narration.duration) ||
    narration.duration <= 0
  )
    throw new Error("Each line needs an aligned cue from the continuous take.");
  const offset = narrationOffset;
  const duration = Math.ceil((narration.duration + offset + outro) * fps) / fps;
  const cues = narration.cues.map((cue, index) => {
    if (
      cue.text !== film.cues[index].text ||
      !Number.isFinite(cue.start) ||
      !Number.isFinite(cue.spokenEnd) ||
      cue.start < 0 ||
      cue.spokenEnd <= cue.start ||
      cue.spokenEnd > narration.duration ||
      (index > 0 && cue.start < narration.cues[index - 1].spokenEnd)
    )
      throw new Error(
        "Invalid or stale aligned cue; recheck the continuous take.",
      );
    return {
      text: cue.text,
      start: cue.start + offset,
      spokenEnd: cue.spokenEnd + offset,
      end:
        index + 1 < narration.cues.length
          ? narration.cues[index + 1].start + offset
          : duration,
    };
  });
  const timed = { ...film, duration, cues };
  frameMap(film, timed);
  return timed;
}

export function frameMap(source, timed) {
  if (
    !Number.isFinite(source.duration) ||
    source.duration <= 0 ||
    !Number.isFinite(timed.duration) ||
    timed.duration <= 0 ||
    !source.cues?.length ||
    source.cues.length !== timed.cues?.length
  )
    throw new Error("Each line needs an aligned cue from the continuous take.");
  const sourceBoundaries = [
    0,
    ...source.cues.map((cue) => Math.round(cue.start * fps)),
    Math.round(source.duration * fps),
  ];
  const targetBoundaries = [
    0,
    ...timed.cues.map((cue) => Math.round(cue.start * fps)),
    Math.round(timed.duration * fps),
  ];
  for (let i = 0; i < sourceBoundaries.length - 1; i++) {
    const original = sourceBoundaries[i + 1] - sourceBoundaries[i];
    const frames = targetBoundaries[i + 1] - targetBoundaries[i];
    if (!Number.isFinite(original) || original <= 0)
      throw new Error(
        "Cue starts must be increasing and after the opening frame.",
      );
    if (
      !Number.isFinite(frames) ||
      frames <= 0 ||
      (i > 0 && (frames > original * 2.5 || frames < original * 0.35))
    )
      throw new Error(
        `Cue ${i} has unexpected timing; inspect the take before retiming.`,
      );
  }
  return { sourceBoundaries, targetBoundaries };
}

// A pure mapping lets Studio seek in either direction and render frames in parallel.
export function sourceFrameAt(
  frame,
  { sourceBoundaries: source, targetBoundaries: target },
) {
  const clamped = Math.max(0, Math.min(frame, target.at(-1)));
  const index = target.findIndex((end, i) => i > 0 && clamped < end) - 1;
  const segment = index < 0 ? target.length - 2 : index;
  return (
    source[segment] +
    ((clamped - target[segment]) * (source[segment + 1] - source[segment])) /
      (target[segment + 1] - target[segment])
  );
}
