import { cp, mkdir, rm } from "node:fs/promises";

const source = new URL("./", import.meta.url);
const output = new URL("../dist/website/", import.meta.url);

// Publish a static artifact rather than the website's source directory.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of ["index.html", "styles.css", "script.js", "assets"]) {
  await cp(new URL(path, source), new URL(path, output), { recursive: true });
}
await cp(new URL("docs/.vitepress/dist/", source), new URL("docs/", output), {
  recursive: true,
});
console.log("Website and documentation built in dist/website");
