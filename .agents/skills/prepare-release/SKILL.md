---
name: prepare-release
description: Prepare a Korus release by auditing changes, confirming version and prerelease/latest channel, and validating the release commit. Hand Nicolas one command that creates the tag, builds and publishes on GitHub. Use when asked to prepare or cut a release, including $prepare-release.
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

Use `app-dod` and review the staged diff. When committing is authorized,
commit with `chore: release prep`. Report the audited SDK version and Git
provenance from the exact npm package, not the sibling HEAD.
Tag creation belongs to the publication command, not preparation. If the user
requested local-only preparation, stop here and report the local commit.

## Push and hand off one command

Once pushing is authorized, push the release commit to the default branch and
verify its remote SHA. For the confirmed channel, give Nicolas exactly one command:

- Prerelease: `npm run prerelease`
- Stable/latest: `npm run latest`

Both infer `v<version>` from package.json, create the missing remote tag at the
clean, pushed release commit, and run one GitHub workflow:
quality → four platform builds → publish. The final job verifies and uploads
the individual installers; there is no combined bundle or second workflow.
The local command dispatches and monitors. Workflow tooling comes from the
default branch; app source stays pinned to the immutable tag. The updated
workflow must be pushed before handoff.

The receipt `.release/v<version>-<channel>.json` tracks the exact run and attempt.
Repeating the same command resumes it. A different channel starts a separate
run; published assets are immutable, so do not promise replacement of an
existing release with rebuilt installers. Use the printed retry/resume commands
for failed runs, with the explicit attempt. Never move the version tag.

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
