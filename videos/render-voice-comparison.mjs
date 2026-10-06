import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { renderNarration } from "./render-narration.mjs";

const run = promisify(execFile);
const root = dirname(fileURLToPath(import.meta.url));
const fps = 24;

async function probe(path) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    path,
  ]);
  return JSON.parse(stdout);
}

// Insert silence into the approved take without dropping or resynthesizing speech.
export async function paceNarration({
  film,
  narration,
  inputPath,
  outputPath,
}) {
  if (resolve(inputPath) === resolve(outputPath))
    throw new Error(
      "Keep the approved narration separate from the paced edit.",
    );
  const source = await probe(inputPath);
  const sampleRate = Number(
    source.streams.find((s) => s.codec_type === "audio")?.sample_rate,
  );
  if (
    !sampleRate ||
    Math.abs(Number(source.format.duration) - narration.duration) > 0.01 ||
    narration.cues?.length !== film.cues.length ||
    !film.cues.length
  )
    throw new Error("Pacing requires the complete aligned take.");
  const sceneScale = 0.97;
  const minPause = 0.9;
  const pauseScale = 0.74;
  const speechSpeed = 0.96;
  const samples = (seconds) => Math.round(seconds * sampleRate);
  const totalSamples = samples(narration.duration);
  const cuts = [0];
  const shifts = [];
  const cues = narration.cues.map((cue, index) => {
    const previous = narration.cues[index - 1];
    if (
      cue.text !== film.cues[index].text ||
      !Number.isFinite(cue.start) ||
      !Number.isFinite(cue.spokenEnd) ||
      cue.start < 0 ||
      cue.spokenEnd <= cue.start ||
      cue.spokenEnd > narration.duration ||
      (previous && cue.start < previous.spokenEnd)
    )
      throw new Error(
        "Invalid or stale aligned cue; recheck the continuous take.",
      );
    let shift = samples(0.7);
    if (previous) {
      cuts.push(samples((previous.spokenEnd + cue.start) / 2));
      const originalGap = cue.start - previous.spokenEnd;
      const baselineGap = Math.max(
        originalGap,
        minPause,
        (film.cues[index].start - film.cues[index - 1].start) * sceneScale -
          (previous.spokenEnd - previous.start),
      );
      // Shorten only the pauses; never trim speech or its natural breaths.
      shift =
        shifts[index - 1] +
        samples(Math.max(0, baselineGap * pauseScale - originalGap));
    }
    shifts.push(shift);
    return {
      ...cue,
      start: cue.start + shift / sampleRate,
      spokenEnd: cue.spokenEnd + shift / sampleRate,
    };
  });
  cuts.push(totalSamples);
  const last = cues.at(-1);
  const duration =
    Math.ceil(
      Math.max(
        narration.duration + shifts.at(-1) / sampleRate,
        last.spokenEnd + 1.5,
        last.start + (film.duration - film.cues.at(-1).start) * sceneScale,
      ) * fps,
    ) / fps;
  const slowedDuration = Math.ceil((duration / speechSpeed) * fps) / fps;
  const filters = [
    `[0:a]asplit=${cues.length}${cues.map((_, i) => `[in${i}]`).join("")}`,
    ...cues.map((_, i) => {
      const padding =
        i + 1 < cues.length
          ? shifts[i + 1] - shifts[i]
          : samples(duration) - totalSamples - shifts[i];
      return `[in${i}]atrim=start_sample=${cuts[i]}:end_sample=${cuts[i + 1]},asetpts=PTS-STARTPTS,apad=pad_len=${padding}[a${i}]`;
    }),
    `${cues.map((_, i) => `[a${i}]`).join("")}concat=n=${cues.length}:v=0:a=1,adelay=${shifts[0]}S:all=1,atempo=${speechSpeed},apad,atrim=end_sample=${samples(slowedDuration)}[out]`,
  ];
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    inputPath,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-c:a",
    "pcm_f32le",
    outputPath,
  ]);
  return {
    duration: slowedDuration,
    cues: cues.map((cue) => ({
      ...cue,
      start: cue.start / speechSpeed,
      spokenEnd: cue.spokenEnd / speechSpeed,
    })),
  };
}

// Fit visual intervals to the edited take, preserving the original choreography.
export async function retimeForNarration({
  film,
  narration,
  inputPath,
  outputPath,
  narrationOffset = 0.5,
  outro = 0.5,
}) {
  if (resolve(inputPath) === resolve(outputPath))
    throw new Error("Keep the silent original separate from the comparison.");
  const source = await probe(inputPath);
  if (
    Math.abs(Number(source.format.duration) - film.duration) > 0.1 ||
    source.streams.find((stream) => stream.codec_type === "video")
      ?.r_frame_rate !== "24/1"
  )
    throw new Error(
      "Re-export the silent film at its scripted duration and 24 fps.",
    );
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
  const boundaries = [
    0,
    ...film.cues.map((cue) => Math.round(cue.start * fps)),
    Math.round(film.duration * fps),
  ];
  const target = [
    0,
    ...cues.map((cue) => Math.round(cue.start * fps)),
    Math.round(duration * fps),
  ];
  const segments = boundaries.slice(0, -1).map((start, index) => {
    const original = boundaries[index + 1] - start;
    if (original <= 0)
      throw new Error(
        "Cue starts must be increasing and after the opening frame.",
      );
    const frames = target[index + 1] - target[index];
    if (
      frames <= 0 ||
      (index > 0 && (frames > original * 2.5 || frames < original * 0.35))
    )
      throw new Error(
        `Cue ${index} has unexpected timing; inspect the take before retiming.`,
      );
    return { start, original, frames };
  });
  const filters = [
    `[0:v]split=${segments.length}${segments.map((_, index) => `[in${index}]`).join("")}`,
    ...segments.map(
      ({ start, original, frames }, index) =>
        `[in${index}]trim=start_frame=${start}:end_frame=${start + original},setpts=(PTS-STARTPTS)*${frames / original},fps=${fps},tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${frames},setpts=N/(${fps}*TB)[v${index}]`,
    ),
    `${segments.map((_, index) => `[v${index}]`).join("")}concat=n=${segments.length}:v=1:a=0[out]`,
  ];
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    inputPath,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[out]",
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    "-preset",
    "fast",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  return { ...film, duration, cues };
}

export async function readApprovedNarration({ folder, film, voice, settings }) {
  const stem = join(folder, "narration");
  const provenance = JSON.parse(await readFile(`${stem}.json`, "utf8"));
  const narration = JSON.parse(await readFile(`${stem}-aligned.json`, "utf8"));
  const hash = createHash("sha256")
    .update(await readFile(`${stem}.wav`))
    .digest("hex");
  if (
    provenance.mode !== "continuous" ||
    provenance.film !== film.id ||
    provenance.model !== settings.model ||
    provenance.revision !== settings.revision ||
    provenance.voice.id !== voice.id ||
    provenance.voice.direction !== voice.direction ||
    provenance.audioSha256 !== hash ||
    narration.audioSha256 !== hash ||
    narration.speakerCheck?.passed !== true ||
    JSON.stringify(provenance.cueTexts) !==
      JSON.stringify(film.cues.map((cue) => cue.text))
  )
    throw new Error(
      `Regenerate stale or mismatched continuous narration: ${stem}`,
    );
  return { narrationPath: `${stem}.wav`, narration };
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const output = resolve(
    args.find((arg) => arg !== "--all") ??
      join(
        homedir(),
        "Downloads",
        all ? "korus-narrated-videos" : "korus-delegation-voices",
      ),
  );
  const script = JSON.parse(
    await readFile(join(root, "narration.json"), "utf8"),
  );
  const settings = JSON.parse(
    await readFile(join(root, "local-voices.json"), "utf8"),
  );
  const selectedFilms = all
    ? script.films
    : script.films.filter((film) => film.id === "delegation-film");
  const selectedVoices = all
    ? settings.voices.filter((voice) => voice.id === "american-male")
    : settings.voices;
  const jobs = selectedFilms.flatMap((film) =>
    selectedVoices.map((voice) => ({
      film,
      voice,
      folder: all ? join(output, film.id, voice.id) : join(output, voice.id),
      id: all ? film.id : `delegation-${voice.id}`,
      title: all ? film.title : voice.title,
    })),
  );
  // Validate every cached clip before replacing any exported film.
  for (const job of jobs) {
    const { film, voice, folder } = job;
    Object.assign(
      job,
      await readApprovedNarration({ film, voice, folder, settings }),
    );
  }
  const films = [];
  for (const job of jobs) {
    const { film, voice, folder, id, title } = job;
    const narrationPath = join(folder, "narration-paced.wav");
    const paced = await paceNarration({
      film,
      narration: job.narration,
      inputPath: job.narrationPath,
      outputPath: narrationPath,
    });
    const inputPath = join(output, `${id}-paced-silent.mp4`);
    const timed = await retimeForNarration({
      film,
      narration: paced,
      narrationOffset: 0,
      outro: 0,
      inputPath: join(root, "assets", `${film.id}.mp4`),
      outputPath: inputPath,
    });
    const rendered = await renderNarration({
      film: { ...timed, id, title },
      inputPath,
      outputPath: join(output, `${id}-paced.mp4`),
      voice: voice.title,
      narrationPath,
    });
    films.push(rendered);
    console.log(
      `${title}: ${rendered.duration.toFixed(2)}s · ${join(output, rendered.video)}`,
    );
  }
  await writeFile(
    join(output, "narration.json"),
    JSON.stringify(
      {
        title: all
          ? "Korus · Five workflows, one voice"
          : "Korus · Two voices, one workflow",
        description: all
          ? "Five films narrated by Calm American, with the approved pauses and speech speed. Optional captions; click a line to replay it."
          : "The same approved voices, with breathing room between lines and calmer scene pacing. Optional captions; click a line to replay it.",
        films,
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
    `Review: npx vite "${output}" --host 127.0.0.1 --port ${all ? 4190 : 4189} --strictPort`,
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
