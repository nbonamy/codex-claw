import { copyFile, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readApprovedNarration,
  paceNarration,
} from "./render-voice-comparison.mjs";
import { alignFilmToNarration } from "./film-timing.mjs";
import { renderFilms } from "./remotion/render.mjs";

// Film-specific export recipe; reuse the approved voice, pacing and caption pipeline.
const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, "local/review-automatic");
const script = JSON.parse(await readFile(join(root, "narration.json"), "utf8"));
const settings = JSON.parse(
  await readFile(join(root, "local-voices.json"), "utf8"),
);
const film = script.films.find((item) => item.id === "review-film");
const voice = settings.voices.find((item) => item.id === "american-male");
const folder = join(output, film.id, voice.id);
const approved = await readApprovedNarration({ folder, film, voice, settings });
const narrationPath = join(folder, "narration-paced.wav");
const paced = await paceNarration({
  film,
  narration: approved.narration,
  inputPath: approved.narrationPath,
  outputPath: narrationPath,
});
const timed = alignFilmToNarration({
  film,
  narration: paced,
  narrationOffset: 0,
  outro: 0,
});
const [rendered] = await renderFilms({
  jobs: [
    {
      film,
      timed,
      id: film.id,
      title: film.title,
      voice: voice.title,
      narrationPath,
    },
  ],
  outputDirectory: output,
});
await writeFile(
  join(output, "narration.json"),
  JSON.stringify(
    {
      title: "Korus · Automatic code review",
      description:
        "Review, fix, and verify automatically—with your choice of reviewer, priorities, and round limit. Calm American narration; optional captions.",
      films: [rendered],
    },
    null,
    2,
  ),
);
await copyFile(join(root, "narration-review.html"), join(output, "index.html"));
console.log(
  `${rendered.duration.toFixed(2)}s · ${join(output, rendered.video)}`,
);
