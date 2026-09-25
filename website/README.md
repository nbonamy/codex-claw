# Codex Claw website

This is a dependency-free static landing page for [codex-claw.nabocorp.com](https://codex-claw.nabocorp.com).

## Local preview

```bash
python3 -m http.server 4173 --directory website
```

Then open <http://127.0.0.1:4173>.

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

`videos/delegation-film.html` is a separate, illustrative 46-second film: a feature conversation leads to Claw's “Start implementation in a worktree?” proposal, visible worktree provisioning, follow-up work with the delegated agent, and a merge with worktree cleanup that closes the agent. Preview it at <http://127.0.0.1:4174/videos/delegation-film.html> and export its ignored MP4 and poster with:

```bash
node videos/render-mission-film.mjs delegation-film
```

## Quick Chat to project product film

`videos/project-film.html` is a separate, illustrative 43-second film: discuss an app idea in Quick Chat, explicitly ask Claw to create a project, see the folder/agent/handoff setup, then open the new project agent while the original Quick Chat remains. The project folder is not shown as a Git repository or worktree. Preview it at <http://127.0.0.1:4174/videos/project-film.html> and export its ignored MP4 and poster with:

```bash
node videos/render-mission-film.mjs project-film
```

The source thumbnail is `videos/assets/project-film-thumbnail.png`.

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
