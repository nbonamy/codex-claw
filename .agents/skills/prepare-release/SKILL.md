---
name: prepare-release
description: Prepare and launch a Korus release by auditing changes, confirming version and prerelease/latest channel, validating and pushing the release commit, then starting the single release command and handing back the run link. Use when asked to prepare or cut a release, including $prepare-release.
---

# Prepare Release

Read the GitHub desktop release section in `docs/backend-architecture.md` for
commands, required environments/secrets, target limitations, and recovery.
The build source is an immutable remote tag. Dependencies
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

Nicolas's confirmation of the version and channel is the authorization to
prepare, commit, push, and launch the release. Do not ask a second time. If he
asked for local-only preparation, stop before pushing and hand him the command.

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

Use `app-dod` and review the staged diff, then commit with
`chore: release prep`. Report the audited SDK version and Git
provenance from the exact npm package, not the sibling HEAD.
Tag creation belongs to the release command, not preparation.

## Push, launch, and hand back

Push the release commit to the default branch and verify its remote SHA. Then run
exactly one command for the confirmed channel:

- Prerelease: `npm run prerelease`
- Stable/latest: `npm run latest`

It requires the clean, pushed default branch, creates the missing remote
`v<version>` tag at HEAD, dispatches one GitHub workflow from that tag (quality →
four platform builds → publish) and watches it. The final job stages the
installers on a draft and publishes the channel; there is no second workflow.

Build and publication take roughly 20 minutes. Run the command in the background,
capture the run ID and URL once dispatch is confirmed, then end the turn so Nicolas
can continue other work. Leave the workflow running; do not occupy the conversation
with polling or wait for publication unless he explicitly asks for monitoring.
On a later request to check progress, inspect that exact run or resume with
`npm run release:watch -- <run-id>`; do not dispatch another build.

On failure, report the failed job and the log excerpt the command printed. Ask
before retrying with `gh run rerun <run-id> --failed`, then resume watching. A
published release is immutable: rebuilt installers cannot replace it, so a fix
after publication means a new version. Never move the version tag.

Only when explicitly asked for build-only validation, use `npm run release:build`;
it dispatches the current pushed branch and never publishes.

Prereleases stay manual-download-only. Latest enables macOS and installed
Windows auto-updates; Linux and portable Windows remain manual. Coordinate the
legacy macOS feed bridge only for an explicitly approved stable cutover.
Native runtime smoke checks do not prove GUI installation, login, or updates;
report outstanding native checks honestly.

## Handoff

Distinguish prepared, committed, pushed, built, draft-staged, native-tested,
published prerelease, and published stable.
At launch, report version/channel, commit/tag, SDK version/provenance, passed local
gates, and the Actions run URL; clearly state that build/publication are pending.
After a requested completion check, include the release URL and outstanding native
target checks. Celebrate a completed
publication through `finish_turn`; preparation or staging alone is not publication.
