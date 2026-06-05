---
name: codex-claw-frontend-dev
description: Use when working on Codex Claw frontend development, including Vue components, Element Plus controls, app shell, agent/team/Bench UI, chat rendering, artifact panes, design tokens, themes, or frontend component tests.
---

# Codex Claw Frontend Development

Use this skill for renderer work: Vue components, Element Plus controls, chat
rendering, app shell, agent/team/Bench surfaces, artifact panes, themes, and
frontend tests.

## First Read

Read `docs/frontend.md` before editing UI. Read `docs/testing.md` before adding
or updating component tests.

## Principles

- Split UI into small named components with one clear job.
- Keep views thin. Views coordinate state and compose components.
- Keep raw Codex payloads out of renderer components; render app-owned state.
- Use typed props and emits for every component.
- Use Element Plus for standard controls when practical.
- Use semantic CSS variables for all product colors, spacing, radii, shadows,
  typography, and diff colors.
- Match Skwad screenshots and `docs/codex.png` for the shell direction.
- Keep operational UI dense, quiet, and scannable.
- Avoid nested cards and decorative layouts.
- Prevent layout jumps during streaming, loading, approvals, and artifact pane
  changes.

## Tests And Verification

- Add or update colocated component tests when a component contract changes.
- Test components in isolation when behavior is local.
- Assert rendered output, emitted events, disabled states, selected state, and
  visible status changes.
- For shared rendering behavior, run the broad relevant test gate once scripts
  exist.
- For visual changes, run the app and check screenshots when tooling exists.
