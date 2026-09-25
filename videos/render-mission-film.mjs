import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const chromePath =
  process.env.CODEX_CLAW_FILM_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const filmName = process.argv[2] ?? "mission-film";
if (
  !["mission-film", "review-film", "delegation-film", "project-film"].includes(
    filmName,
  )
)
  throw new Error(`Unknown film: ${filmName}`);
const outputPath = join(root, `assets/${filmName}.mp4`);
const posterPath = join(root, `assets/${filmName}-poster.png`);
const fps = 24;
const duration =
  filmName === "project-film"
    ? 43
    : filmName === "delegation-film"
      ? 46
      : filmName === "review-film"
        ? 50
        : 48;
const posterSecond =
  filmName === "project-film"
    ? 30
    : filmName === "delegation-film"
      ? 29
      : filmName === "review-film"
        ? 23
        : 12;
const allowedFiles = new Map([
  [`/${filmName}.html`, [`${filmName}.html`, "text/html; charset=utf-8"]],
  [`/${filmName}.css`, [`${filmName}.css`, "text/css; charset=utf-8"]],
  [`/${filmName}.mjs`, [`${filmName}.mjs`, "text/javascript; charset=utf-8"]],
  ["/mission-film.css", ["mission-film.css", "text/css; charset=utf-8"]],
  ["/review-film.css", ["review-film.css", "text/css; charset=utf-8"]],
  ["/delegation-film.css", ["delegation-film.css", "text/css; charset=utf-8"]],
  [
    "/website/assets/claw-icon.png",
    ["../website/assets/claw-icon.png", "image/png"],
  ],
]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDevtools(profilePath) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const [port] = (
        await readFile(join(profilePath, "DevToolsActivePort"), "utf8")
      ).split("\n");
      if (port) return Number(port);
    } catch {
      /* Chrome is still starting. */
    }
    await delay(100);
  }
  throw new Error("Chrome did not open its DevTools port.");
}

async function waitForPage(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const pages = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      const page = pages.find(
        (item) => item.type === "page" && item.url.includes(`${filmName}.html`),
      );
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* The tab is still loading. */
    }
    await delay(100);
  }
  throw new Error(`${filmName} tab was not available in Chrome.`);
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let id = 0;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        id += 1;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function writeFrame(stream, buffer) {
  if (!stream.write(buffer)) await once(stream, "drain");
}

async function render() {
  const profilePath = await mkdtemp(join(tmpdir(), "codex-claw-film-"));
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = allowedFiles.get(pathname);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    try {
      response.writeHead(200, { "content-type": file[1] });
      response.end(await readFile(join(root, file[0])));
    } catch {
      response.writeHead(500).end();
    }
  });
  let chrome;
  let cdp;
  let ffmpeg;
  let ffmpegError = "";
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = server.address().port;
    chrome = spawn(
      chromePath,
      [
        "--headless=new",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-gpu",
        "--hide-scrollbars",
        "--remote-debugging-port=0",
        "--remote-allow-origins=*",
        `--user-data-dir=${profilePath}`,
        "--window-size=1600,900",
        `http://127.0.0.1:${port}/${filmName}.html?export=1`,
      ],
      { stdio: "ignore" },
    );
    const devtoolsPort = await waitForDevtools(profilePath);
    cdp = await connectCdp(await waitForPage(devtoolsPort));
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const ready = await cdp.send("Runtime.evaluate", {
        expression:
          "Boolean(window.seekFilm) && document.readyState === 'complete'",
        returnByValue: true,
      });
      if (ready.result.value) break;
      if (attempt === 99) throw new Error(`${filmName} script did not load.`);
      await delay(100);
    }
    await cdp.send("Runtime.evaluate", {
      expression: "document.fonts.ready",
      awaitPromise: true,
    });

    ffmpeg = spawn(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-framerate",
        String(fps),
        "-i",
        "pipe:0",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    ffmpeg.stderr.on("data", (chunk) => {
      ffmpegError += chunk.toString();
    });

    for (let frame = 0; frame < duration * fps; frame += 1) {
      const seconds = frame / fps;
      await cdp.send("Runtime.evaluate", {
        expression: `window.seekFilm(${seconds})`,
      });
      const result = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      const png = Buffer.from(result.data, "base64");
      if (frame === posterSecond * fps) await writeFile(posterPath, png);
      await writeFrame(ffmpeg.stdin, png);
      if (frame % (fps * 4) === 0)
        process.stdout.write(
          `Rendered ${String(Math.floor(seconds)).padStart(2, "0")}/${duration}s\n`,
        );
    }
    ffmpeg.stdin.end();
    const [code] = await once(ffmpeg, "close");
    if (code !== 0)
      throw new Error(`ffmpeg failed (${code}): ${ffmpegError.trim()}`);
    process.stdout.write(`Wrote ${outputPath}\nWrote ${posterPath}\n`);
  } catch (error) {
    throw new Error(
      `${error.message}${ffmpegError ? `\nffmpeg: ${ffmpegError.trim()}` : ""}`,
      { cause: error },
    );
  } finally {
    cdp?.close();
    if (ffmpeg?.exitCode === null) ffmpeg.kill("SIGTERM");
    if (chrome?.exitCode === null) chrome.kill("SIGKILL");
    server.close();
    await rm(profilePath, { recursive: true, force: true });
  }
}

render().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
