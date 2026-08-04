---
name: prepare-release
description: Prepare a Codex Claw desktop release by auditing CHANGELOG.md against Git history, synchronizing package versions, freezing generated release notes, committing the release-prep changes, and creating an annotated release tag. Use when Nicolas asks to prepare, cut, freeze, or version a Codex Claw release, including `$prepare-release` with or without a version.
---

# Prepare Release

Prepare the release commit and its local annotated tag only. Do not build, push,
publish, or upload the release until Nicolas separately chooses who will build
it.

## 1. Require a clean repository

Run `git status --short` before any other mutation. If it returns any entry,
abort immediately and report the dirty paths. Do not stash, discard, stage, or
include existing changes.

Confirm the current branch and upstream for context, but do not pull or switch
branches.

## 2. Resolve the target version

Read the current version from the root `package.json`.

- If the user supplied the target version, use it.
- Otherwise ask the user for the target version and wait.
- Require plain semantic version form such as `0.5.0`, without a `v` prefix.
- Require the target to be greater than the current version and absent from
  existing `CHANGELOG.md` release headings.

State the confirmed transition, for example `0.4.0 -> 0.5.0`, before editing.

## 3. Audit the changelog against Git

Prefer the current release tag as the audit baseline:

```bash
git rev-parse --verify "refs/tags/v<current-version>"
```

If it exists, audit `v<current-version>..HEAD`. If it does not exist because
the current release predates this tagging workflow, find the commit that
introduced the current release heading:

```bash
git log -n 1 --format=%H -S "## [<current-version>]" -- CHANGELOG.md
```

If neither baseline is found, stop and ask Nicolas how to establish the release
range. Otherwise inspect all first-parent commits and the aggregate diff since
the resolved baseline:

```bash
git log --first-parent --reverse --format='%h %s' <baseline>..HEAD
git diff --stat <baseline>..HEAD
```

Compare those changes with the `## Unreleased` section. Inspect relevant commit
diffs when titles are insufficient. Ensure every meaningful user-visible
feature or fix is represented, consolidate duplicates, and exclude internal
refactors or tests that did not change user behavior. If a change is ambiguous,
ask before inventing release copy.

Do not proceed with an empty or knowingly incomplete `Unreleased` section.

## 4. Freeze the release

Move the reviewed `Unreleased` body under this heading using today's local
date:

```markdown
## Unreleased

## [<target-version>] - YYYY-MM-DD

<reviewed release notes>
```

Update all version-owned files together:

- `package.json`
- `shared/package.json`
- `backend/package.json`
- `electron/package.json`
- the `@codex-claw/shared` dependency in backend and Electron manifests

Use `apply_patch` for the manifests, then mechanically refresh the lockfile:

```bash
npm install --package-lock-only --ignore-scripts
```

Generate the frozen renderer artifact:

```bash
npm run release-notes:generate
```

The generated JSON version must equal the target package version and its
Markdown must exactly represent the new changelog release section.

## 5. Verify the release-prep diff

Run:

```bash
npm run release-notes:check
git diff --check
git status --short
```

Only these paths may be changed:

- `CHANGELOG.md`
- `package.json`
- `package-lock.json`
- `shared/package.json`
- `backend/package.json`
- `electron/package.json`
- `electron/src/renderer/generated/release-notes.json`

Abort if another path changed. Review the complete diff and confirm that every
manifest and lockfile workspace version equals the target.

## 6. Commit and tag release preparation

Stage only the seven allowed paths. Review `git diff --cached --check`,
`git diff --cached --stat`, and the cached diff, then commit with exactly:

```text
chore: release prep
```

After the commit, require `git status --short` to be empty. Do not push.

Require the target tag not to exist, then create an annotated tag on the
release-prep commit and verify that it resolves to `HEAD`:

```bash
git rev-parse -q --verify "refs/tags/v<target-version>"
git tag -a "v<target-version>" -m "codex claw <target-version>"
test "$(git rev-parse HEAD)" = "$(git rev-list -n 1 "v<target-version>")"
```

The first command must return no tag before creation. Do not move, replace, or
push an existing tag.

## 7. Hand off the build decision

Report the version, commit hash, and local tag, then ask Nicolas explicitly:

```text
Who should run npm run make—you or me?
```

Stop and wait. Do not start `npm run make` until he answers.
