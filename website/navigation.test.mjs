import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import test from "node:test";
import { chromium } from "playwright";

// Catch navigation that disappears at responsive breakpoints. This exercises
// the actual built page and its styles through a browser, without source assertions.
test("navigation and illustrations stay readable at desktop and phone widths", async () => {
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
    for (const width of [1440, 1040, 820, 761, 760, 600, 430, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(origin);
      for (const selector of [".hero-copy", ".hero h1", ".hero-lede"]) {
        const bounds = await page.locator(selector).boundingBox();
        assert.ok(
          bounds.x >= 0 && bounds.x + bounds.width <= width,
          `Hero copy fits at ${width}px: ${selector}`,
        );
      }
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
      // Card previews must neither overlap wrapped copy nor escape their cards.
      for (const card of await page.locator(".capability").all()) {
        const layout = await card.evaluate((element) => {
          const copy = element.querySelector("p");
          const preview = copy.nextElementSibling;
          const a = copy.getBoundingClientRect();
          const b = preview.getBoundingClientRect();
          const outer = element.getBoundingClientRect();
          return {
            overlap:
              a.left < b.right &&
              b.left < a.right &&
              a.top < b.bottom &&
              b.top < a.bottom,
            contained:
              b.left >= outer.left &&
              b.right <= outer.right &&
              b.bottom <= outer.bottom,
          };
        });
        assert.equal(
          layout.overlap,
          false,
          `Card preview overlaps copy at ${width}px`,
        );
        assert.equal(
          layout.contained,
          true,
          `Card preview escapes its card at ${width}px`,
        );
      }
      // The selection and remediation action must not get clipped on phones.
      // Check rendered geometry rather than freezing the illustration's copy.
      const review = page.getByRole("img", { name: /review findings/i });
      await review.scrollIntoViewIfNeeded();
      await page.waitForFunction(() =>
        document.querySelector(".git-panel")?.classList.contains("is-visible"),
      );
      await review.evaluate((element) =>
        Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
      const panelBounds = await review.boundingBox();
      assert.ok(
        panelBounds.x >= 0 && panelBounds.x + panelBounds.width <= width,
      );
      for (const selector of [".finding-row", ".findings-footer"]) {
        const elements = review.locator(selector);
        assert.ok(await elements.count());
        for (const element of await elements.all()) {
          assert.ok(
            await element.evaluate(
              (node) => node.scrollWidth <= node.clientWidth,
            ),
            `Review contents fit at ${width}px: ${selector}`,
          );
        }
      }
      await docs.click();
      await page.getByRole("heading", { level: 1 }).waitFor();
      assert.equal(new URL(page.url()).pathname, "/docs/");
    }
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
