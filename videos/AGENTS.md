# Promotional videos

This folder contains editable, scripted Korus product films. Follow the repository-root `AGENTS.md` as well as these film-specific conventions.

## Before building a film

1. Inspect the closest existing film and its thumbnail. Reuse the series' app shell, typography, pacing, controls, and interaction language where they fit.
2. Check the current product UI and behavior for the workflow being promoted. Keep panes, actions, and shipped capabilities recognizable. Promotional motion can exaggerate a real transition; label the result as an illustration rather than a live recording.
3. Default to a 16:9, 1600×900 film. Make a 9:16 cut only when Nicolas asks for Shorts/TikTok/vertical format.

## Source and motion

- Keep editable HTML, CSS, and JavaScript in `videos/`. The shared renderer is `render-mission-film.mjs`; add each new film to its allowlist, duration, and poster timing.
- Drive every visual state from a deterministic `window.seekFilm(seconds)`. Scrubbing, playback, and exported frames must tell the same story at the same timestamp.
- Carry the viewer through the workflow with movement inside the app—typed prompts, progressing work, panels, diagrams, and objects moving into their next state. Use scene transitions sparingly; avoid a sequence of fade-outs/fade-ins or decorative wave/shift effects.
- Keep progress causal and legible. A task or defect should advance through its stages rather than jump to completion or reset visually.

### Cursor and clicks

Match the earlier films' cursor treatment (see `review-film.mjs` and `delegation-film.mjs`):

- Schedule only meaningful clicks as `[start, click, selector]` against the actual rendered target. Derive its center from `getBoundingClientRect()` relative to the scaled film, rather than hard-coding screen coordinates.
- Ease the cursor in from nearby, briefly scale it down on press, and show one short ripple (about 0.28 seconds) at the target. Hide cursor and ripple outside that click's interval.
- Inspect frames immediately before, during, and after each click. The pointer must land on the control that changes state; a continuously blinking ring or cursor floating over unrelated content fails this check.

## Assets and handoff

- Track editable film source in `videos/` and thumbnail artwork in `videos/assets/`. MP4s and poster frames are rebuildable outputs and stay ignored by Git. Do not add other generated artifacts to the repository.
- Keep the thumbnail consistent with the existing series: a strong, readable headline and a recognizable product visual. Do not rely on tiny fake UI copy to explain it.
- Preview the film in a browser and inspect representative frames for every stage, all scene boundaries, and each click. Export the MP4, confirm dimensions, frame rate, duration, and decoding, then inspect frames from the **rendered video** as well as the live viewer.
- Update `website/README.md` with the new viewer and export command. State what is illustrative, and hand off the editable source, tracked thumbnail, and ignored rendered MP4 separately.
- These standalone films are verified through deterministic playback, media checks, and visual inspection. Do not add brittle source-text or snapshot tests for choreography; add automated tests if reusable application behavior or a shared contract changes.
