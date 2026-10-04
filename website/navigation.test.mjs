import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import { chromium } from "playwright";

// Catch navigation that disappears at responsive breakpoints. This exercises
// the actual built page and its styles through a browser, without source assertions.
test("visitors can open documentation from the header at desktop and phone widths", async () => {
  const artifact = new URL("../dist/website/", import.meta.url);
  const types = {
    ".css": "text/css",
    ".js": "text/javascript",
    ".html": "text/html",
  };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const file = path.endsWith("/") ? `${path}index.html` : path;
    try {
      const body = await readFile(new URL(`.${file}`, artifact));
      const type = types[file.slice(file.lastIndexOf("."))];
      response.writeHead(200, {
        "Content-Type": type ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  let browser;
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.route("**/*", (route) =>
      route.request().url().startsWith(origin)
        ? route.continue()
        : route.abort(),
    );
    for (const width of [1440, 761, 760, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(origin);
      const header = page.getByRole("banner");
      const docs = header.getByRole("link", { name: "Docs", exact: true });
      assert.equal(
        await docs.isVisible(),
        true,
        `Docs is visible at ${width}px`,
      );
      const bounds = await docs.boundingBox();
      assert.ok(
        bounds.x >= 0 && bounds.x + bounds.width <= width,
        `Docs fits at ${width}px`,
      );
      const download = header.getByRole("link", { name: "Download for macOS" });
      assert.equal(await download.isVisible(), true);
      const downloadBounds = await download.boundingBox();
      assert.ok(
        downloadBounds.x >= 0 &&
          downloadBounds.x + downloadBounds.width <= width,
        `Download fits at ${width}px`,
      );
      await docs.click();
      await page.locator("h1#claw-documentation").waitFor();
      assert.equal(new URL(page.url()).pathname, "/docs/");
    }
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
