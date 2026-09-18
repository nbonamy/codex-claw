---
name: codex-claw-testing-coverage
description: Use when adding tests, fixing failing tests, raising coverage, changing IPC/app contracts, testing Vue components in isolation, or verifying Codex Claw desktop behavior.
---

# Codex Claw Testing And Coverage

Use this skill when adding tests, fixing failing tests, raising coverage, or
changing contracts.

## First Read

Read `docs/testing.md` before changing tests or testable behavior.

## Principles

- Test observable behavior and app contracts, not implementation details.
- Match test scope to risk.
- Use focused tests while iterating, then run the full relevant gate.
- For provider integration, fake the public Codex app SDK or Claude Agent SDK
  and exercise the real Claw adapter/backend. For application integration, fake
  the unified backend and exercise real app state and representative mounted UI.
  Use the fixtures and ownership rules in `docs/testing.md`.
- For provider-independent services, test their own external boundary: Electron
  shell, filesystem, git, clocks, and OS dialogs.
- Prefer realistic component interaction over mutating internals directly.
- New shared components, public helpers, reducers, adapters, and persistence
  code should have direct tests.
- If focused tests pass but broader verification fails, reproduce and fix the
  broader failure.

## Component Tests

- Use Vitest, Vue Test Utils, and jsdom.
- Co-locate component tests in `__tests__/` folders.
- Use the real Element Plus plugin for controls.
- Test components in isolation when the behavior belongs to that component.
- Assert visible text, aria labels, button states, emitted payloads, selected
  rows, and status changes.
- Keep snapshots rare and explicit.

## Coverage Triage

- Use coverage to find missing risk, not to pad arbitrary lines.
- Prioritize missed branches in protocol adapters, IPC, persistence, reducers,
  tool/approval rendering, diff rendering, filesystem/git behavior, Bench, and
  teams.
- Prefer tests around public behavior before adding test-only seams.
- Keep the threshold at or above 85% once coverage tooling is configured.

## Standard Gates

Prefer these commands once scripts exist:

```bash
npm test
npm run test:ai
npm run test:coverage
npm run lint
npm run build
```

Prefer `npm run test:ai` for an unfiltered agent-driven suite. It keeps Vitest
summaries and failures while suppressing passing-test noise.

If a command is not available yet, report that directly in the handoff.
