import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { JSDOM } from "jsdom";
import { films, FPS } from "../film-catalog.mjs";
import { frameMap } from "../film-timing.mjs";
import { readApprovedNarration } from "../render-voice-comparison.mjs";

export const videos = new URL("../", import.meta.url);
export const publicDirectory = new URL(
  "../local/remotion/public/",
  import.meta.url,
);
const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

// Keep each film's authored cascade together; only the active composition inserts it.
async function stylesheet(url) {
  const css = await readFile(url, "utf8");
  const imports = [...css.matchAll(/@import url\("([^"]+)"\);/g)];
  let expanded = css;
  for (const item of imports)
    expanded = expanded.replace(
      item[0],
      await stylesheet(new URL(item[1], url)),
    );
  return expanded;
}

export async function cachedNarratedJobs() {
  const script = await readJson(new URL("narration.json", videos));
  const settings = await readJson(new URL("local-voices.json", videos));
  let records;
  try {
    records = (await readJson(new URL("local/narrated/narration.json", videos)))
      .films;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const voice = settings.voices.find((item) => item.id === "american-male");
  return Promise.all(
    records.map(async (timed) => {
      const film = script.films.find((item) => item.id === timed.id);
      if (
        !film ||
        timed.cues.length !== film.cues.length ||
        timed.cues.some((cue, i) => cue.text !== film.cues[i].text)
      )
        throw new Error(
          `Stale narrated film: ${timed.id}. Re-export the approved take.`,
        );
      const folder = fileURLToPath(
        new URL(`local/narrated/${film.id}/${voice.id}/`, videos),
      );
      await readApprovedNarration({ folder, film, voice, settings });
      return {
        film,
        timed,
        id: film.id,
        title: film.title,
        voice: voice.title,
        narrationPath: resolve(folder, "narration-paced.wav"),
      };
    }),
  );
}

export async function prepareAssets(narratedJobs = []) {
  const product = await readJson(new URL("../core/src/product.json", videos));
  const sources = [];
  for (const film of films) {
    const dom = new JSDOM(
      await readFile(new URL(`${film.id}.html`, videos), "utf8"),
    );
    const viewport = dom.window.document.querySelector(".film-viewport");
    const controls = dom.window.document.querySelector(".controls");
    if (!viewport || !controls)
      throw new Error(`Incomplete film markup: ${film.id}`);
    const markup = (viewport.outerHTML + controls.outerHTML)
      .replaceAll("__PRODUCT_NAME__", product.name)
      .replaceAll("__PRODUCT_WEBSITE_HOST__", new URL(product.websiteUrl).host)
      .replaceAll("../website/assets/app-icon.png?v=mark-2", "__FILM_ICON__");
    dom.window.close();
    sources.push({
      ...film,
      markup,
      css: await stylesheet(new URL(`${film.id}.css`, videos)),
      durationInFrames: Math.round(film.duration * FPS),
    });
  }
  const narrated = narratedJobs.map((job) => {
    if (
      !sources.some((source) => source.id === job.film.id) ||
      !/^[a-z0-9-]+$/.test(job.id)
    )
      throw new Error(`Unknown or invalid film: ${job.id}`);
    return {
      id: job.id,
      sourceId: job.film.id,
      title: job.title,
      durationInFrames: Math.round(job.timed.duration * FPS),
      ...frameMap(job.film, job.timed),
      audio: `${job.id}.wav`,
    };
  });
  await mkdir(publicDirectory, { recursive: true });
  await copyFile(
    new URL("../website/assets/app-icon.png", videos),
    new URL("app-icon.png", publicDirectory),
  );
  for (const [index, job] of narratedJobs.entries()) {
    // Normalize one continuous take; never synthesize or splice lines here.
    await promisify(execFile)("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-i",
      job.narrationPath,
      "-af",
      `pan=stereo|c0=c0|c1=c0,aresample=48000,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=duration=${job.timed.duration}`,
      "-ar",
      "48000",
      fileURLToPath(new URL(narrated[index].audio, publicDirectory)),
    ]);
  }
  const manifest = { fps: FPS, sources, narrated };
  await writeFile(
    new URL("manifest.json", publicDirectory),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await prepareAssets(await cachedNarratedJobs());
  console.log("Prepared the film series for Remotion Studio.");
}
