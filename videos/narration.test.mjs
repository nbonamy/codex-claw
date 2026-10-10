import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { chromium } from "playwright";
import { renderNarration } from "./render-narration.mjs";
import {
  paceNarration,
  readApprovedNarration,
} from "./render-voice-comparison.mjs";
import { alignFilmToNarration } from "./film-timing.mjs";

const run = promisify(execFile);

test("batch exports reject the wrong film, voice, script, or stale audio checks", async () => {
  const folder = await mkdtemp(join(tmpdir(), "narration-provenance-test-"));
  try {
    const audio = Buffer.from("checked audio fixture");
    const audioSha256 = createHash("sha256").update(audio).digest("hex");
    const film = { id: "mission", cues: [{ text: "Build a feature." }] };
    const voice = { id: "american", direction: "Calm voice" };
    const settings = { model: "local-tts", revision: "pinned" };
    const provenance = {
      ...settings,
      voice,
      film: film.id,
      mode: "continuous",
      audioSha256,
      cueTexts: [film.cues[0].text],
    };
    const narration = { audioSha256, speakerCheck: { passed: true }, cues: [] };
    await writeFile(join(folder, "narration.wav"), audio);
    await writeFile(join(folder, "narration.json"), JSON.stringify(provenance));
    await writeFile(
      join(folder, "narration-aligned.json"),
      JSON.stringify(narration),
    );
    const input = { folder, film, voice, settings };
    assert.deepEqual(await readApprovedNarration(input), {
      narrationPath: join(folder, "narration.wav"),
      narration,
    });
    for (const changed of [
      { film: { ...film, id: "review" } },
      { voice: { ...voice, id: "british" } },
      { film: { ...film, cues: [{ text: "Changed script." }] } },
    ])
      await assert.rejects(
        readApprovedNarration({ ...input, ...changed }),
        /mismatched/,
      );
    await writeFile(
      join(folder, "narration-aligned.json"),
      JSON.stringify({ ...narration, speakerCheck: { passed: false } }),
    );
    await assert.rejects(readApprovedNarration(input), /mismatched/);
    await writeFile(
      join(folder, "narration-aligned.json"),
      JSON.stringify(narration),
    );
    await writeFile(
      join(folder, "narration.wav"),
      Buffer.from("regenerated take"),
    );
    await assert.rejects(readApprovedNarration(input), /mismatched/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("paced narration slows speech without lowering pitch and keeps pauses aligned", async () => {
  const folder = await mkdtemp(join(tmpdir(), "paced-narration-test-"));
  try {
    const inputPath = join(folder, "take.wav");
    const outputPath = join(folder, "paced.wav");
    await run("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=3:sample_rate=24000",
      inputPath,
    ]);
    const original = await readFile(inputPath);
    const film = {
      duration: 6,
      cues: [
        { start: 0.5, text: "One" },
        { start: 3, text: "Two" },
      ],
    };
    const narration = {
      duration: 3,
      cues: [
        { start: 0, spokenEnd: 1.4, text: "One" },
        { start: 1.5, spokenEnd: 2.9, text: "Two" },
      ],
    };
    const paced = await paceNarration({
      film,
      narration,
      inputPath,
      outputPath,
    });
    const gap = paced.cues[1].start - paced.cues[0].spokenEnd;
    assert.ok(
      Math.abs(gap - (1.025 * 0.74) / 0.96) <= 1 / 24000,
      "slightly lengthen the previous breathing gap",
    );
    assert.ok(
      Math.abs(paced.cues[0].spokenEnd - paced.cues[0].start - 1.4 / 0.96) <
        0.001,
    );
    assert.ok(paced.duration - paced.cues[1].start >= 3 * 0.97);
    assert.ok(paced.duration < 6.2, "keep the edit close to the original pace");
    async function pcm(path) {
      return (
        await run(
          "ffmpeg",
          ["-v", "error", "-i", path, "-f", "f32le", "pipe:1"],
          { encoding: "buffer" },
        )
      ).stdout;
    }
    const after = await pcm(outputPath);
    const byteAt = (seconds) => Math.round(seconds * 24000) * 4;
    // Check the rendered waveform, not just the reported timestamps.
    for (const cue of paced.cues) {
      const start = Math.round((cue.start + 0.1) * 24000);
      const end = Math.round((cue.spokenEnd - 0.1) * 24000);
      let crossings = 0;
      let energy = 0;
      for (let i = start; i < end; i++) {
        const sample = after.readFloatLE(i * 4);
        energy += sample ** 2;
        if (sample > 0 && after.readFloatLE((i - 1) * 4) <= 0) crossings++;
      }
      assert.ok(
        Math.sqrt(energy / (end - start)) > 0.05,
        "speech spans contain audio",
      );
      assert.ok(
        Math.abs((crossings * 24000) / (end - start) - 440) < 2,
        "the slowed voice retains its original pitch",
      );
    }
    const gapStart = byteAt(paced.cues[0].spokenEnd + 0.2);
    const gapEnd = byteAt(paced.cues[1].start - 0.2);
    assert.deepEqual(
      after.subarray(gapStart, gapEnd),
      Buffer.alloc(gapEnd - gapStart),
    );
    assert.equal(after.length, byteAt(paced.duration));
    assert.deepEqual(await readFile(inputPath), original);
    await assert.rejects(
      paceNarration({ film, narration, inputPath, outputPath: inputPath }),
      /separate/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("continuous narration stays intact through caption boundaries", async () => {
  const folder = await mkdtemp(join(tmpdir(), "local-narration-test-"));
  try {
    const original = join(folder, "original.mp4");
    const speech = join(folder, "speech.wav");
    const outputPath = join(folder, "narrated.mp4");
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=160x90:rate=24:duration=6",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      original,
    ]);
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=5",
      speech,
    ]);
    const film = {
      id: "external",
      duration: 4,
      cues: [
        { start: 0.5, end: 1.9, text: "First cue" },
        { start: 2, end: 3.9, text: "Second cue" },
      ],
    };
    const originalBytes = await readFile(original);
    const shared = alignFilmToNarration({
      film,
      narration: {
        duration: 5,
        cues: [
          { start: 0.1, spokenEnd: 2.1, text: "First cue" },
          { start: 2.8, spokenEnd: 4.7, text: "Second cue" },
        ],
      },
    });
    assert.equal(shared.cues[0].start, 0.6);
    assert.equal(shared.cues[1].start, 3.3);
    assert.equal(shared.duration, 6);
    const report = await renderNarration({
      film: shared,
      inputPath: original,
      outputPath,
      narrationPath: speech,
      narrationOffset: 0.5,
      voice: "Local voice",
    });
    assert.equal(report.rate, null);
    assert.equal(report.cues[0].spokenEnd, 2.6);
    assert.equal(report.cues[1].spokenEnd, 5.2);
    // No sentence-sized splice or silent gap: the same oscillator continues
    // through the caption/scene boundary at 3.3 seconds.
    const { stdout: pcm } = await run(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        outputPath,
        "-vn",
        "-ar",
        "8000",
        "-ac",
        "1",
        "-f",
        "f32le",
        "pipe:1",
      ],
      { encoding: "buffer" },
    );
    for (const start of [0.7, 3.1, 3.3, 5.1]) {
      let energy = 0;
      for (
        let i = Math.round(start * 8000);
        i < Math.round((start + 0.1) * 8000);
        i++
      )
        energy += pcm.readFloatLE(i * 4) ** 2;
      assert.ok(
        Math.sqrt(energy / 800) > 0.01,
        `audio remains continuous at ${start}s`,
      );
    }
    const { stdout } = await run("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-of",
      "json",
      outputPath,
    ]);
    assert.ok(
      Math.abs(Number(JSON.parse(stdout).format.duration) - shared.duration) <
        0.05,
    );
    await run("ffmpeg", ["-v", "error", "-i", outputPath, "-f", "null", "-"]);
    // Audio muxing must preserve the visual ending.
    async function ending(path) {
      return (
        await run(
          "ffmpeg",
          [
            "-v",
            "error",
            "-sseof",
            "-0.05",
            "-i",
            path,
            "-frames:v",
            "1",
            "-vf",
            "scale=16:9,format=gray",
            "-f",
            "rawvideo",
            "pipe:1",
          ],
          { encoding: "buffer" },
        )
      ).stdout;
    }
    const before = await ending(original);
    const after = await ending(outputPath);
    assert.equal(after.length, before.length);
    assert.ok(
      after.reduce(
        (sum, value, index) => sum + Math.abs(value - before[index]),
        0,
      ) /
        after.length <
        5,
    );
    assert.deepEqual(await readFile(original), originalBytes);
    await assert.rejects(
      renderNarration({
        film: shared,
        inputPath: original,
        outputPath,
        narrationPath: speech,
        narrationOffset: 3,
      }),
      /cut off/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

// Protects synchronized audio, full-length exports, and preservation of an existing
// draft when edited copy no longer fits. Uses real say/FFmpeg, not synthesis mocks.
test(
  "narration and optional captions stay synchronized; unsafe re-renders preserve the draft",
  { skip: process.platform !== "darwin" },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), "narration-test-"));
    try {
      const inputPath = join(folder, "silent.mp4");
      const outputPath = join(folder, "draft.mp4");
      await run("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=160x90:r=24:d=4",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        inputPath,
      ]);
      const film = {
        id: "fixture",
        duration: 4,
        cues: [{ start: 1, end: 2.8, text: "Hello there." }],
      };
      const report = await renderNarration({ film, inputPath, outputPath });
      await checkCaptionControls(folder, report);
      assert.ok(
        report.cues[0].spokenEnd > 1 && report.cues[0].spokenEnd <= 2.8,
      );
      const { stdout } = await run("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        outputPath,
      ]);
      const metadata = JSON.parse(stdout);
      assert.ok(Math.abs(Number(metadata.format.duration) - 4) < 0.05);
      assert.equal(
        metadata.streams.find((stream) => stream.codec_type === "audio")
          .codec_name,
        "aac",
      );
      assert.equal(
        metadata.streams.find((stream) => stream.codec_type === "video").width,
        160,
      );
      const { stdout: pcm } = await run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          outputPath,
          "-vn",
          "-f",
          "f32le",
          "-ar",
          "8000",
          "-ac",
          "1",
          "pipe:1",
        ],
        { encoding: "buffer" },
      );
      const rms = (start, end) => {
        let sum = 0;
        for (let i = Math.floor(start * 8000); i < Math.floor(end * 8000); i++)
          sum += pcm.readFloatLE(i * 4) ** 2;
        return Math.sqrt(sum / ((end - start) * 8000));
      };
      assert.ok(
        rms(0.1, 0.8) < 0.001,
        "preserve silence before the scheduled cue",
      );
      assert.ok(
        rms(1, 2.5) > 0.01,
        "speech must be audible at the scheduled cue",
      );
      assert.ok(
        rms(3, 3.8) < 0.001,
        "pad the outro with silence rather than truncate it",
      );
      assert.match(
        await readFile(join(folder, "draft.vtt"), "utf8"),
        /00:00:01\.000 -->/,
      );
      const goodDraft = await readFile(outputPath);
      await assert.rejects(
        renderNarration({
          film: {
            ...film,
            cues: [
              {
                start: 1,
                end: 1.1,
                text: "This sentence cannot fit in a tenth of a second.",
              },
            ],
          },
          inputPath,
          outputPath,
        }),
        /speech would be cut off/,
      );
      await assert.rejects(
        renderNarration({
          film: {
            ...film,
            cues: [...film.cues, { start: 2, end: 3, text: "Overlap." }],
          },
          inputPath,
          outputPath,
        }),
        /non-overlapping/,
      );
      assert.deepEqual(await readFile(outputPath), goodDraft);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);

// Exercises the actual review page with a real rendered clip and its VTT track.
async function checkCaptionControls(folder, film) {
  const server = createServer(async (request, response) => {
    const files = {
      "/": [new URL("./narration-review.html", import.meta.url), "text/html"],
      "/draft.mp4": [join(folder, "draft.mp4"), "video/mp4"],
      "/draft.vtt": [join(folder, "draft.vtt"), "text/vtt"],
    };
    if (request.url === "/narration.json") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          title: "Voice comparison",
          description: "Two local voices",
          films: [
            { ...film, title: "First film" },
            {
              ...film,
              id: "second",
              title: "Second film",
              voice: "Local voice",
              rate: null,
            },
          ],
        }),
      );
      return;
    }
    const file = files[request.url];
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    try {
      response.writeHead(200, { "content-type": file[1] });
      response.end(await readFile(file[0]));
    } catch {
      response.writeHead(500).end();
    }
  });
  let browser;
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await page.title(), "Voice comparison");
    assert.equal(
      await page.locator("#intro").textContent(),
      "Two local voices",
    );
    const toggle = page.getByRole("button", { name: "CC · Captions" });
    await page.waitForFunction(
      () => document.querySelector("video").readyState >= 2,
    );
    assert.equal(await toggle.getAttribute("aria-pressed"), "false");
    assert.equal(
      await page.evaluate(
        () => document.querySelector("video").textTracks[0].mode,
      ),
      "disabled",
    );
    await toggle.click();
    await page.locator(".cue").click();
    await page.waitForFunction(
      () =>
        document.querySelector("video").textTracks[0].activeCues?.[0]?.text ===
        "Hello there.",
    );
    assert.equal(
      await page.evaluate(
        () => document.querySelector("video").textTracks[0].mode,
      ),
      "showing",
    );
    await page
      .getByRole("button", { name: "Second film", exact: true })
      .click();
    assert.match(
      await page.locator("#voice").textContent(),
      /Local voice · local AI narration/,
    );
    await page.waitForFunction(
      () => document.querySelector("video").readyState >= 2,
    );
    assert.equal(await toggle.getAttribute("aria-pressed"), "true");
    assert.equal(
      await page.evaluate(
        () => document.querySelector("video").textTracks[0].mode,
      ),
      "showing",
    );
    await toggle.click();
    assert.equal(
      await page.evaluate(
        () => document.querySelector("video").textTracks[0].mode,
      ),
      "disabled",
    );
    // The native CC menu changes this same browser-owned track state.
    await page.evaluate(() => {
      document.querySelector("video").textTracks[0].mode = "showing";
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector("#toggle-captions")
          .getAttribute("aria-pressed") === "true",
    );
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
