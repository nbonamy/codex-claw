import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = dirname(fileURLToPath(import.meta.url));

async function duration(path) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    path,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error(`Invalid media duration: ${path}`);
  return seconds;
}

function timestamp(seconds) {
  return new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23);
}

// Also used for individual re-renders after copy changes; input video is never modified.
export async function renderNarration({
  film,
  inputPath,
  outputPath,
  voice = "Samantha",
  rate = 180,
  narrationPath,
  narrationOffset = 0,
}) {
  if (resolve(inputPath) === resolve(outputPath))
    throw new Error("Keep draft output separate from the silent original.");
  if (!outputPath.endsWith(".mp4"))
    throw new Error("Draft output must end in .mp4.");
  if (
    !Number.isFinite(film.duration) ||
    film.duration <= 0 ||
    !film.cues?.length
  )
    throw new Error("A film needs a duration and narration cues.");
  if (!Number.isFinite(narrationOffset) || narrationOffset < 0)
    throw new Error("Narration offset must be nonnegative.");
  if (!narrationPath && (!Number.isFinite(rate) || rate < 80 || rate > 250))
    throw new Error("Speech rate must be between 80 and 250 words per minute.");
  let previousEnd = 0;
  for (const cue of film.cues) {
    if (
      !Number.isFinite(cue.start) ||
      !Number.isFinite(cue.end) ||
      cue.start < previousEnd ||
      cue.end <= cue.start ||
      cue.end > film.duration ||
      !cue.text?.trim()
    ) {
      throw new Error(
        "Narration cues must be ordered, non-overlapping, nonempty, and inside the film.",
      );
    }
    if (
      narrationPath &&
      (!Number.isFinite(cue.spokenEnd) ||
        cue.spokenEnd <= cue.start ||
        cue.spokenEnd > cue.end)
    )
      throw new Error(
        "Continuous narration needs measured spoken boundaries for every cue.",
      );
    previousEnd = cue.end;
  }
  const videoDuration = await duration(inputPath);
  if (Math.abs(videoDuration - film.duration) > 0.1)
    throw new Error(
      `Re-render ${film.id}: video is ${videoDuration}s, script expects ${film.duration}s.`,
    );
  await mkdir(dirname(outputPath), { recursive: true });
  const scratch = await mkdtemp(join(tmpdir(), "korus-narration-"));
  // Final replacement stays on the output filesystem, even for a custom volume.
  const outputScratch = await mkdtemp(join(dirname(outputPath), ".narration-"));
  try {
    const inputs = [];
    const cues = [];
    const overflows = [];
    if (narrationPath) {
      const seconds = await duration(narrationPath);
      if (seconds + narrationOffset > film.duration + 0.001)
        throw new Error("Continuous speech would be cut off; extend the film.");
      inputs.push("-i", narrationPath);
      cues.push(...film.cues);
    } else
      for (const [index, cue] of film.cues.entries()) {
        const path = join(scratch, `${index}.aiff`);
        await run("say", [
          "-v",
          voice,
          "-r",
          String(rate),
          "-o",
          path,
          cue.text,
        ]);
        const seconds = await duration(path);
        if (seconds > cue.end - cue.start)
          overflows.push(
            `${cue.start}s: needs ${seconds.toFixed(2)}s, has ${(cue.end - cue.start).toFixed(2)}s — ${cue.text}`,
          );
        cues.push({
          ...cue,
          spokenEnd: Number((cue.start + seconds).toFixed(3)),
        });
        inputs.push("-i", path);
      }
    if (overflows.length)
      throw new Error(
        `Shorten the copy or extend the scene; speech would be cut off:\n${overflows.join("\n")}`,
      );
    const filters = narrationPath
      ? [
          `[1:a]aresample=48000,adelay=${Math.round(narrationOffset * 1000)}:all=1[mixed]`,
        ]
      : cues.map(
          (cue, index) =>
            `[${index + 1}:a]aresample=48000,adelay=${Math.round(cue.start * 1000)}:all=1[a${index}]`,
        );
    if (!narrationPath)
      filters.push(
        `${cues.map((_, index) => `[a${index}]`).join("")}amix=inputs=${cues.length}:normalize=0:dropout_transition=0[mixed]`,
      );
    filters.push(
      `[mixed]loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=duration=${film.duration}[voice]`,
    );
    const rendered = join(outputScratch, "film.mp4");
    await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "0:v:0",
      "-map",
      "[voice]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      "-t",
      String(film.duration),
      rendered,
    ]);
    const subtitles = `WEBVTT\n\n${cues.map((cue, index) => `${index + 1}\n${timestamp(cue.start)} --> ${timestamp(cue.spokenEnd)}\n${cue.text}\n`).join("\n")}`;
    await writeFile(join(outputScratch, "film.vtt"), subtitles);
    await rename(rendered, outputPath);
    await rename(
      join(outputScratch, "film.vtt"),
      outputPath.replace(/\.mp4$/, ".vtt"),
    );
    return {
      ...film,
      cues,
      voice,
      rate: narrationPath ? null : rate,
      video: basename(outputPath),
      subtitles: basename(outputPath).replace(/\.mp4$/, ".vtt"),
    };
  } finally {
    await rm(scratch, { recursive: true, force: true });
    await rm(outputScratch, { recursive: true, force: true });
  }
}

async function main() {
  const requested = process.argv[2] ?? "all";
  const output = resolve(
    process.argv[3] ?? join(root, "local", "voiceover-drafts"),
  );
  const script = JSON.parse(
    await readFile(join(root, "narration.json"), "utf8"),
  );
  const selected = script.films.filter(
    (film) => requested === "all" || film.id === requested,
  );
  if (!selected.length) throw new Error(`Unknown film: ${requested}`);
  const films = [];
  for (const film of selected) {
    const result = await renderNarration({
      film,
      inputPath: join(root, "assets", `${film.id}.mp4`),
      outputPath: join(output, `${film.id}-draft.mp4`),
      voice: process.env.APP_FILM_VOICE ?? script.voice,
      rate: script.rate,
    });
    films.push(result);
    console.log(
      `${film.title}: ${film.cues.length} cues fit; wrote ${join(output, result.video)}`,
    );
  }
  // An individual export updates the existing review list rather than hiding the other films.
  let existing = [];
  try {
    existing = JSON.parse(
      await readFile(join(output, "narration.json"), "utf8"),
    ).films;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const merged = script.films
    .map(
      (film) =>
        films.find((item) => item.id === film.id) ??
        existing.find((item) => item.id === film.id),
    )
    .filter(Boolean);
  await writeFile(
    join(output, "narration.json"),
    JSON.stringify(
      {
        voice: process.env.APP_FILM_VOICE ?? script.voice,
        rate: script.rate,
        films: merged,
      },
      null,
      2,
    ),
  );
  await copyFile(
    join(root, "narration-review.html"),
    join(output, "index.html"),
  );
  console.log(
    `Review: npx vite "${output}" --host 127.0.0.1 --port 4187 --strictPort`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
