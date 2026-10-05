import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import product from "../core/src/product.json" with { type: "json" };

const source = new URL("./", import.meta.url);
const output = new URL("../dist/website/", import.meta.url);

// Publish a static artifact rather than the website's source directory.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of ["styles.css", "script.js", "assets"]) {
  await cp(new URL(path, source), new URL(path, output), { recursive: true });
}
const landing = await readFile(new URL("index.html", source), "utf8");
await writeFile(
  new URL("index.html", output),
  landing
    .replaceAll("__PRODUCT_NAME__", product.name)
    .replaceAll("__PRODUCT_WEBSITE_URL__", product.websiteUrl)
    .replaceAll(
      "__PRODUCT_DOWNLOAD_PATH__",
      `/desktop/downloads/${product.downloadFileName}`,
    ),
);
await cp(new URL("docs/.vitepress/dist/", source), new URL("docs/", output), {
  recursive: true,
});
console.log("Website and documentation built in dist/website");
