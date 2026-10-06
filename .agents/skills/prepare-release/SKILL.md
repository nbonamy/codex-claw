---
name: prepare-release
description: Prepare a Korus release by auditing changes, confirming version and prerelease/latest channel, validating and tagging. Hand Nicolas one command for GitHub-hosted build and publication. Use when asked to prepare or cut a release, including $prepare-release.
---

# Prepare Release

Read the GitHub desktop release section in `docs/backend-architecture.md` for
commands, required environments/secrets, target limitations, and recovery.
The build source is an immutable remote tag plus its resolved SHA. Dependencies
come from published packages and `package-lock.json`, never a live sibling SDK.

## Audit and confirm version and channel

1. Require a clean Korus worktree. Preserve existing changes and stop if dirty.
2. Read and execute `../update-changelog/SKILL.md`. Require audited user-visible
   outcomes, app/SDK baselines, the pinned SDK release's Git provenance, and an
   exact semantic-version recommendation. Stop if the audit recommends no release.
3. Present the evidence and recommendation before version edits. An explicit
   user-supplied version can be used after checking it against the audit.
   Otherwise obtain confirmation of the recommended version. Require a plain
   semantic version greater than the current one and an unused Git tag.
4. Confirm the release channel alongside the version: **prerelease** (manual
   downloads, no auto-update) or **latest** (stable, advances auto-update). Use
   an explicitly supplied choice; otherwise ask before preparing. Do not infer
   latest from "release" or "publish".

Preparation and channel selection are not permission to publish. Unless Nicolas
explicitly asks you to launch publication, prepare the release and hand him the
single selected command to run himself.

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
npm run lint
npm run test:coverage
npm run test:scripts
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

## Push and hand off one command

Once pushing is authorized, push the branch and immutable tag and verify their
remote SHA. For the confirmed channel, give Nicolas exactly one command:

- Prerelease: `npm run prerelease`
- Stable/latest: `npm run latest`

Both infer `v<version>` from package.json and perform the complete workflow:
build → monitor → verify → create draft/upload assets → publish. All binary
transfers and verification happen on GitHub runners, never through Nicolas's
machine. The local command sends requests and displays progress only. The
publication workflow runs from the default branch; build inputs remain pinned
to the version tag. Both workflows must be available remotely before handoff.

The receipt `.release/v<version>.json` tracks exact build and publication runs.
Repeating the same command resumes without rebuilding; `npm run latest` after a
prerelease reuses the verified build. After interruption, resume the same
shortcut, not `release:monitor`, which only watches and cannot publish.
For failed runs, use the printed retry/resume commands and explicit attempt;
never move the version tag. Artifacts expire after 30 days.

Only when explicitly asked for build-only validation, use `release:build` with
`--tag v<version>`. That path deliberately stops before publication. Local
artifact download is a separate opt-in inspection action, not a release step.

Prereleases stay manual-download-only. Latest enables macOS and installed
Windows auto-updates; Linux and portable Windows remain manual. Coordinate the
legacy macOS feed bridge only for an explicitly approved stable cutover.
Native runtime smoke checks do not prove GUI installation, login, or updates;
report outstanding native checks honestly.

## Handoff

Distinguish prepared, committed, pushed, built, draft-staged, native-tested,
published prerelease, and promoted stable.
Include version, commit/tag, SDK version/provenance, Actions run/attempt and URL,
artifact location, gates, and outstanding target checks. Celebrate a completed
publication through `finish_turn`; preparation or staging alone is not publication.
