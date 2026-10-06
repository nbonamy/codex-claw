---
name: prepare-release
description: Audit, version, freeze, and stage a Korus desktop release with reproducible GitHub builds. Use when Nicolas asks to prepare or cut a release, including $prepare-release. Promote the production download and update feed only when publication is explicitly authorized.
---

# Prepare Release

Read the GitHub desktop release section in `docs/backend-architecture.md` for
commands, required environments/secrets, target limitations, and recovery.
The build source is an immutable remote tag plus its resolved SHA. Dependencies
come from published packages and `package-lock.json`, never a live sibling SDK.

## Audit and confirm the version

1. Require a clean Korus worktree. Preserve existing changes and stop if dirty.
2. Read and execute `../update-changelog/SKILL.md`. Require audited user-visible
   outcomes, app/SDK baselines, the pinned SDK release's Git provenance, and an
   exact semantic-version recommendation. Stop if the audit recommends no release.
3. Present the evidence and recommendation before version edits. An explicit
   user-supplied version can be used after checking it against the audit.
   Otherwise obtain confirmation of the recommended version. Require a plain
   semantic version greater than the current one and an unused Git tag.

## Freeze and validate

Move reviewed Unreleased notes under `## [<version>] - YYYY-MM-DD`. Update
the root and five workspace package versions and internal `@workspace/*`
dependencies together using `apply_patch`. Then run:

```bash
npm install --package-lock-only --ignore-scripts
npm ci
node node_modules/electron/install.js
npm run release-notes:generate
npm run release-notes:check
npm run typecheck
npm run lint
npm run test:ai
npm run test:coverage
git diff --check
git status --short
```

Use the Node/npm versions declared in the release workflow. Require all tests,
including script tests, and 85% statements in each of the five workspaces.
A failing gate blocks release. Only CHANGELOG.md, the six package manifests,
package-lock.json, and vue/src/generated/release-notes.json may change.

Use `app-dod` and review the staged diff. When the user has authorized committing
and tagging this release, commit with `chore: release prep`. Create an annotated
`v<version>` tag on that exact commit, recording:

- `app <version>`;
- `codex-app-sdk: <published-sdk-git-head>`;
- `codex-app-sdk-version: <locked-sdk-version>`.

Resolve SDK Git provenance from the exact npm version, not the sibling HEAD.
Never replace or move an existing release tag. If the user requested local-only
preparation, stop here and report the local commit/tag.

## Push, build, and stage

GitHub builds require the commit and tag to exist remotely. Once pushing and
dispatch are authorized, push the branch and the new tag explicitly, verify
their remote SHA, then run:

```bash
npm run release:build -- --tag v<version> --state .release/<version>.json
```

The command resolves the remote tag, saves a dispatch receipt, launches the
workflow, and monitors its exact run/attempt. All four targets are required:
macOS ARM64, unsigned Windows x64, Linux x64 and ARM64. macOS remains Developer
ID signed and notarized. The workflow stages Actions artifacts; it never writes
production or creates a public release.

On a terminal/network interruption, resume with `release:monitor -- --state
.release/<version>.json`. On failure, inspect the printed run/job links and logs.
For a same-source retry, explicitly rerun **all** jobs, then monitor using
`--attempt N`. Missing, cancelled, skipped, timed-out, mismatched, or failed
required jobs block promotion. Source fixes need a fresh reviewed commit/tag;
do not relabel artifacts or move a release tag.

Download and verify the staged bundle into a new directory:

```bash
npm run release:download -- --state .release/<version>.json --output .release/<version>-review
```

Report staged artifact provenance and request the remaining native installer/UI
checks before the first release on a new OS. A hosted build's native runtime
smoke check is not proof of GUI installation, authentication, or updates.

## Explicit promotion

If publication was not authorized, hand off the staged result. When authorized,
configure the explicit SSH destination, key-file path and pinned known-hosts file
described in the architecture doc, then use a fresh download directory:

```bash
npm run release:promote -- --state .release/<version>.json --output .release/<version>-promote
```

Promotion rechecks the exact successful run/attempt and every artifact hash,
uploads all targets, and advances the existing meetkorus.dev macOS feed last
under a remote lock. Windows/Linux downloads are archived; their auto-updaters
remain disabled. Never set signing bypasses for a release.

If promotion fails, report its phase and inspect remote state using the documented
recovery procedure. A versioned asset collision after a partial promotion needs
operator review; never delete a lock, overwrite assets, or force a rollback to
make a retry pass.

## Handoff

Distinguish prepared, committed, pushed, built, staged, native-tested, and promoted.
Include version, commit/tag, SDK version/provenance, Actions run/attempt and URL,
artifact location, gates, and outstanding target checks. Celebrate a completed
publication through `finish_turn`; preparation or staging alone is not publication.
