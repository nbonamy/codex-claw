# Codex Claw website

This contains the static landing page and VitePress documentation for [codex-claw.nabocorp.com](https://codex-claw.nabocorp.com).

## Local preview

```bash
python3 -m http.server 4173 --directory website
```

Then open <http://127.0.0.1:4173>.

## Documentation

The public user guide lives in `website/docs/` and uses VitePress with a
customized default theme. The navigation follows Getting started, Providers,
Workflows, Features, Reference, and Troubleshooting. Internal engineering notes
stay in the repository's top-level `docs/` directory and are not published.

Run from the repository root:

```bash
npm run docs:dev
```

Open the `/docs/` URL reported by VitePress. Edit the Markdown pages and keep
the sidebar in `website/docs/.vitepress/config.mts` in sync. Search uses the
local page index and requires no hosted search service. The theme reuses the
landing page's public assets and supplies light and dark tokens.

Build, check, and preview the complete static website:

```bash
npm run test:docs
npm run docs:check
python3 -m http.server 4173 --directory dist/website
```

Visit <http://127.0.0.1:4173/docs/>. `test:docs` builds the site and checks the
generated links, anchors, asset paths, and exclusion of authoring files.
`npm run docs:preview` previews just the VitePress production output after
`npm run docs:build`.

Use a file extension on raw HTML card links so direct loads work on the static
host. Keep VitePress's dead-link checking enabled. The site uses `/docs/` as
its base path and standard `.html` page URLs, so nginx needs no SPA rewrite
for documentation routes.

## Product preview

The hero currently uses a lightweight HTML and CSS product composition. It is deliberately structured as a replaceable media frame so a current release screenshot can take over later without changing the page narrative.

When a product screenshot is ready, replace the `.product-window` element inside `.product-visual__media` with:

```html
<img
  class="product-screenshot"
  src="assets/product-shell.png"
  alt="Codex Claw with repository-grouped sessions, an active conversation, and a review pane"
/>
```

Keep the screenshot free of private repository names, issue content, messages, and account details. The website positions Claw as a workspace for agentic software engineering workflows. Missions, direct repository sessions, Review, and Visualize support that story; the page should explain their value without becoming a release changelog.

Run the static-site checks with:

```bash
npm run test:website
```

The header keeps **Docs** visible beside the download button at all screen
widths. Its responsive browser regression test uses Chromium:

```bash
npx playwright install chromium
npm run test:website:browser
```

## Mission product film

`videos/mission-film.html` is an editable 48-second HTML/CSS/JavaScript illustration of a Mission moving from prompt through Requirements, Tickets, Implementation, Review, and Ship. After the PR action, it cuts to a clear promotional handoff showing the pull request ready for review, then returns to the closing title. The Mission scenes follow the desktop app's three-pane layout and current light-theme tokens. The cloud-agent feature and PR shown are an illustrative scenario, not a claim that cloud-agent support has shipped or a recording of a live run.

Preview the films from the repository root with `python3 -m http.server 4174 --directory .`, then open <http://127.0.0.1:4174/videos/mission-film.html>. The pages have play, pause, restart, and scrub controls. To export a silent, caption-led 1600×900 MP4 and poster image, install Chrome and FFmpeg, then run:

```bash
node videos/render-mission-film.mjs
```

The render writes `videos/assets/mission-film.mp4` and `videos/assets/mission-film-poster.png`. These rebuildable outputs are ignored by Git; run the renderer for each film when you need an MP4 or poster. The thumbnails remain as source artwork, and the viewers reuse the website's Claw icon. Set `CODEX_CLAW_FILM_CHROME` if Chrome is not at the default macOS path. The deterministic `window.seekFilm(seconds)` renderer drives both the preview and frame export, so the encoded video matches the editable source.

## Code Review product film

`videos/review-film.html` is a separate, illustrative 50-second walkthrough of Claw's standalone `/review` command: open Review, choose branch scope and an independent reviewer, inspect structured findings, remediate the selected issues, run a second round, and finish. It is not the Mission Review stage or a captured live review. Preview it at <http://127.0.0.1:4174/videos/review-film.html> and export its MP4 and poster with:

```bash
node videos/render-mission-film.mjs review-film
```

## Worktree delegation product film

`videos/delegation-film.html` is a separate, illustrative 46-second film: a feature conversation leads to typing and submitting `/delegate` in the current agent's composer, handoff preparation, visible worktree provisioning, follow-up work with the delegated agent, and a merge with worktree cleanup that closes the delegated agent. The original agent and conversation remain available. Preview it at <http://127.0.0.1:4174/videos/delegation-film.html> and export its ignored MP4 and poster with:

```bash
node videos/render-mission-film.mjs delegation-film
```

## Quick Chat to project product film

`videos/project-film.html` is a separate, illustrative 43-second film: discuss an app idea in Quick Chat, explicitly ask Claw to create a project, see the folder/agent/handoff setup, then open the new project agent while the original Quick Chat remains. The project folder is not shown as a Git repository or worktree. Preview it at <http://127.0.0.1:4174/videos/project-film.html> and export its ignored MP4 and poster with:

```bash
node videos/render-mission-film.mjs project-film
```

The source thumbnail is `videos/assets/project-film-thumbnail.png`.

`videos/project-shorts.html` reframes the same story as an editable 40-second 9:16 vertical cut for TikTok and YouTube Shorts. It uses larger mobile-readable captions and a focused app close-up; the explicit create request and retained Quick Chat remain visible. Preview it at <http://127.0.0.1:4174/videos/project-shorts.html> and export the ignored 1080×1920 MP4 and poster with:

```bash
node videos/render-mission-film.mjs project-shorts
```

## Visualize and annotations product film

`videos/visualize-film.html` is an editable 31-second, 16:9 illustration of the shipped Visualize flow: enter `/visualize`, choose a suggested diagram, watch it populate and zoom on the Excalidraw canvas, annotate one shape, submit the annotation without extra composer text, and see just that part of the diagram refined. It is a scripted promotion, not a recording of a live run. Preview it at <http://127.0.0.1:4174/videos/visualize-film.html> and export the ignored 1600×900 MP4 and poster with:

```bash
node videos/render-mission-film.mjs visualize-film
```

The source thumbnail is `videos/assets/visualize-film-thumbnail.png`.

## Deploy

The deploy helper first builds the landing page and generated documentation into
`dist/website/`, then streams that artifact over SSH, provisions the Let’s Encrypt
certificate if this is the first deploy, and installs the matching nginx site on `joshua`:

```bash
./website/deploy.sh
```

Override `CODEX_CLAW_WEBSITE_HOST`, `CODEX_CLAW_WEBSITE_ROOT`, or `CODEX_CLAW_NGINX_CONFIG` when needed. The remote account must be able to run `sudo install`, `sudo nginx -t`, and `sudo systemctl reload nginx`.

Desktop releases use the same host and are published with:

```bash
npm run publish
```

That command checks that the version is newer than the remote manifest, creates the macOS artifacts, and uploads the DMG, ZIP, and `RELEASES.json`. The landing-page download buttons target the uploaded arm64 DMG.
