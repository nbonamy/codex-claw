# Codex Claw website

This is a dependency-free static landing page for [codex-claw.nabocorp.com](https://codex-claw.nabocorp.com).

## Local preview

```bash
python3 -m http.server 4173 --directory website
```

Then open <http://127.0.0.1:4173>.

## Replacing the hero placeholder

Put the supplied product screenshot at `website/assets/claw-screenshot.png` and replace the `.hero-screenshot-placeholder` block in `index.html` with an image using the same class. The existing frame preserves the crop, border, and responsive placement.

## Deploy

The deploy helper streams the static site over SSH, provisions the Let’s Encrypt certificate if this is the first deploy, and installs the matching nginx site on `joshua`:

```bash
./website/deploy.sh
```

Override `CODEX_CLAW_WEBSITE_HOST`, `CODEX_CLAW_WEBSITE_ROOT`, or `CODEX_CLAW_NGINX_CONFIG` when needed. The remote account must be able to run `sudo install`, `sudo nginx -t`, and `sudo systemctl reload nginx`.

Desktop releases use the same host and are published with:

```bash
npm run publish
```

That command checks that the version is newer than the remote manifest, creates the macOS artifacts, and uploads the DMG, ZIP, and `RELEASES.json`. The landing-page download buttons target the uploaded arm64 DMG.
