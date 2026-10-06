// Website-owned manual downloads. Never infer publication from the app version
// or use GitHub's "latest" endpoint: it excludes prereleases.
export async function resolveDownloads({
  product,
  tag,
  verify = false,
  fetchImpl = fetch,
}) {
  const base = `https://github.com/${product.repository}/releases`;
  const names = {
    MACOS: `${product.slug}-macos-arm64.dmg`,
    WINDOWS: `${product.slug}-win32-x64-setup.exe`,
    WINDOWS_ZIP: `${product.slug}-win32-x64.zip`,
  };
  for (const arch of ["x64", "arm64"])
    for (const format of ["deb", "rpm", "zip"])
      names[`LINUX_${arch.toUpperCase()}_${format.toUpperCase()}`] =
        `${product.slug}-linux-${arch}.${format}`;

  async function request(url, method) {
    const response = await fetchImpl(url, {
      ...(method ? { method } : {}),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`Download check failed (${response.status}): ${url}`);
    return response;
  }

  let release;
  let releaseUrl = base;
  if (tag) {
    if (!/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag))
      throw new Error(
        "APP_WEBSITE_RELEASE_TAG must be an explicit version tag, such as v1.2.3.",
      );
    releaseUrl = `${base}/tag/${tag}`;
    release = await (
      await request(
        `https://api.github.com/repos/${product.repository}/releases/tags/${tag}`,
      )
    ).json();
    if (
      release.draft ||
      !release.published_at ||
      release.tag_name !== tag ||
      release.html_url !== releaseUrl
    )
      throw new Error(
        `Expected a published release for ${tag} (prereleases are supported).`,
      );
  }

  const assets = {};
  for (const [key, name] of Object.entries(names)) {
    const url = `${base}/download/${tag}/${name}`;
    const published = release?.assets?.some(
      (asset) =>
        asset.name === name &&
        asset.state === "uploaded" &&
        asset.size > 0 &&
        asset.browser_download_url === url,
    );
    if (published) await request(url, "HEAD");
    assets[key] = {
      url: published ? url : releaseUrl,
      available: Boolean(published),
    };
  }
  if (verify) await request(releaseUrl, "HEAD");
  return { releaseUrl, assets };
}
