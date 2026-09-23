import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Reuse the renderer workspace's declared DOM test dependency.
const require = createRequire(new URL("../vue/package.json", import.meta.url));
const { JSDOM } = require("jsdom");

test("visitors can navigate the page and reach the desktop download", async () => {
  const dom = await JSDOM.fromFile(
    fileURLToPath(new URL("index.html", import.meta.url)),
  );
  try {
    const { document } = dom.window;
    const links = [...document.querySelectorAll('a[href^="#"]')];
    assert.ok(links.length > 0);
    for (const link of links) {
      assert.ok(document.querySelector(link.hash), "Link destination exists");
      link.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(dom.window.location.hash, link.hash);
    }

    const downloads = [...document.querySelectorAll("a[download]")];
    assert.ok(downloads.length > 0);
    for (const link of downloads) {
      assert.equal(
        link.getAttribute("href"),
        "/desktop/downloads/codex-claw-macos-arm64.dmg",
      );
    }
  } finally {
    dom.window.close();
  }
});
