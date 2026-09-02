import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const websiteDirectory = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(websiteDirectory, "index.html"), "utf8");
const compactHtml = html.replace(/\s+/g, " ");

test("presents the current repository-first product story", () => {
  assert.match(compactHtml, /Code in parallel\./);
  assert.match(compactHtml, /Repository-first sessions/);
  assert.match(compactHtml, /Repository-grouped sessions/);
  assert.match(compactHtml, /New isolated session/);
  assert.match(compactHtml, /dedicated branch and worktree/);
  assert.match(compactHtml, /Quick Chats/);
  assert.match(compactHtml, /Automations/);
  assert.doesNotMatch(compactHtml, /The new Cockpit/i);
  assert.doesNotMatch(compactHtml, /New in 0\.11|v0\.11|\bLoops\b/);
});

test("keeps the core product sections in narrative order", () => {
  const sectionIds = [
    "sessions",
    "routing",
    "workspace",
    "automations",
    "download",
  ];
  let previousIndex = -1;

  for (const id of sectionIds) {
    const index = html.indexOf(`id="${id}"`);
    assert.ok(index > previousIndex, `${id} should follow the prior section`);
    previousIndex = index;
  }
});

test("keeps every page anchor and local asset valid", () => {
  const ids = new Set(
    [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]),
  );
  const localReferences = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(
    (match) => match[1],
  );

  for (const reference of localReferences) {
    if (reference.startsWith("#")) {
      assert.ok(
        ids.has(reference.slice(1)),
        `Missing anchor target for ${reference}`,
      );
      continue;
    }
    if (reference.startsWith("/") || reference.startsWith("http")) continue;

    const assetPath = reference.split("?")[0];
    assert.ok(
      existsSync(path.join(websiteDirectory, assetPath)),
      `Missing local asset ${assetPath}`,
    );
  }
});

test("uses one page heading and useful product metadata", () => {
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(compactHtml, /<meta name="description" content="[^"]+"/);
  assert.match(compactHtml, /<meta property="og:title" content="[^"]+"/);
  assert.match(compactHtml, /<meta property="og:description" content="[^"]+"/);
  assert.match(compactHtml, /<meta property="og:image" content="[^"]+"/);
  assert.match(
    compactHtml,
    /<meta name="twitter:card" content="summary_large_image"/,
  );
});
