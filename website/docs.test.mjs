import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import product from "../core/src/product.json" with { type: "json" };

const artifact = new URL("../dist/website/", import.meta.url);
const origin = product.websiteUrl;

async function files(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = `${prefix}${entry.name}`;
      return entry.isDirectory()
        ? files(new URL(`${entry.name}/`, directory), `${path}/`)
        : [path];
    }),
  );
  return nested.flat();
}

// Protect the deployed /docs/ navigation boundary, including direct page loads.
// Inspect built HTML, never the Markdown or VitePress implementation source.
test("the built website has reachable documentation pages, anchors, and assets", async () => {
  const paths = await files(artifact);
  const documents = new Map();
  for (const path of paths.filter((path) => path.endsWith(".html"))) {
    documents.set(
      path,
      new JSDOM(await readFile(new URL(path, artifact), "utf8"), {
        url: `${origin}/${path}`,
      }),
    );
  }

  try {
    const landing = documents.get("index.html").window.document;
    assert.ok(landing.title.startsWith(product.name));
    assert.ok(
      landing.querySelector(".brand").textContent.includes(product.name),
    );
    assert.ok(!landing.documentElement.outerHTML.includes("__PRODUCT_NAME__"));
    assert.ok(
      landing.querySelector('a[href="/docs/"]'),
      "Landing page links to the docs",
    );
    const home = documents.get("docs/index.html").window.document;
    assert.ok(
      [...home.querySelectorAll("main a[href]")].some(
        (link) =>
          new URL(link.href).pathname ===
          "/docs/getting-started/quickstart.html",
      ),
      "The documentation introduction links to the quickstart",
    );

    let documentationLinks = 0;
    for (const [path, dom] of documents) {
      for (const element of dom.window.document.querySelectorAll(
        "a[href], img[src], script[src], link[href]",
      )) {
        const url = new URL(
          element.getAttribute("href") ?? element.getAttribute("src"),
          dom.window.location.href,
        );
        // Desktop release artifacts are published through a separate release workflow.
        if (url.origin !== origin || url.pathname.startsWith("/desktop/"))
          continue;
        const target = decodeURIComponent(url.pathname).slice(1);
        const info = await stat(new URL(target, artifact)).catch(() => null);
        assert.ok(
          info,
          `${path}: ${url.pathname} exists in the deployed artifact`,
        );
        const destination = info.isDirectory()
          ? `${target}${target.endsWith("/") || !target ? "" : "/"}index.html`
          : target;
        if (element.tagName === "A" && destination.startsWith("docs/"))
          documentationLinks++;
        if (info.isDirectory())
          assert.ok(
            documents.has(destination),
            `${url.pathname} has a directory index`,
          );
        if (url.hash && documents.has(destination)) {
          assert.ok(
            documents
              .get(destination)
              .window.document.getElementById(
                decodeURIComponent(url.hash.slice(1)),
              ),
            `${path}: anchor ${url.hash} exists in ${destination}`,
          );
        }
      }
    }
    assert.ok(documentationLinks > 0, "Documentation navigation was exercised");
  } finally {
    for (const dom of documents.values()) dom.window.close();
  }
});

// The deploy artifact must keep authoring files and internal documentation private.
test("the deployment artifact excludes documentation inputs and server configuration", async () => {
  const paths = await files(artifact);
  assert.ok(paths.includes("docs/index.html"));
  assert.ok(paths.includes("docs/404.html"));
  for (const path of paths) {
    assert.doesNotMatch(
      path,
      /(?:^|\/)\.(?:vitepress|env)(?:\/|$)|\.(?:md|mts|ts|mjs|conf|sh)$/,
      `${path} is a public asset rather than an authoring or operator file`,
    );
  }
});
