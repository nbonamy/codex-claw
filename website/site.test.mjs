import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const websiteDirectory = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(websiteDirectory, "index.html"), "utf8");
const compactHtml = html.replace(/\s+/g, " ");

test("presents the current Cockpit and Git workflow story", () => {
  assert.match(compactHtml, /Your backlog,.*already in motion\./);
  assert.match(compactHtml, /GitHub-native operator inbox/);
  assert.match(compactHtml, /3.*agents launched.*isolated worktrees/);
  assert.match(compactHtml, /Git, all the way through/);
  assert.doesNotMatch(compactHtml, /drag a GitHub issue/i);
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
});
