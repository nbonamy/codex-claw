---
name: prepare-release
description: Prepare a Codex Claw desktop release by auditing CHANGELOG.md against Codex Claw and its sibling codex-app-sdk Git histories, synchronizing package versions, freezing generated release notes, committing the release-prep changes, and creating an annotated release tag with SDK provenance. Use when Nicolas asks to prepare, cut, freeze, or version a Codex Claw release, including `$prepare-release` with or without a version.
---

# Prepare Release

Prepare the release commit and its local annotated tag only. Do not build, push,
publish, or upload the release until Nicolas separately chooses who will build
it.

## 1. Require clean, reproducible repositories

Codex Claw's release build consumes the live sibling checkout at
`../codex-app-sdk`, so treat both repositories as release inputs. Before any
mutation, run:

```bash
git status --short
git -C ../codex-app-sdk status --short
```

If either command returns any entry, abort immediately and report which
repository and paths are dirty. Do not make exceptions for documentation-only
SDK changes. Do not stash, discard, stage, commit, or include existing changes.

Confirm the current branch and upstream in both repositories, but do not pull
or switch branches. Require the SDK `HEAD` to equal its upstream exactly so the
build input is committed, pushed, and reproducible:

```bash
test "$(git -C ../codex-app-sdk rev-parse HEAD)" = \
  "$(git -C ../codex-app-sdk rev-parse '@{u}')"
```

Stop if the SDK has no upstream or differs from it. Record the SDK `HEAD` as
`<sdk-head>` for the remaining steps.

## 2. Resolve the target version

Read the current version from the root `package.json`.

- If the user supplied the target version, use it.
- Otherwise ask the user for the target version and wait.
- Require plain semantic version form such as `0.5.0`, without a `v` prefix.
- Require the target to be greater than the current version and absent from
  existing `CHANGELOG.md` release headings.

State the confirmed transition, for example `0.4.0 -> 0.5.0`, before editing.

## 3. Audit the changelog against both Git histories

### Codex Claw

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

### Codex App SDK

Read the SDK baseline recorded in the current release tag annotation:

```bash
git for-each-ref "refs/tags/v<current-version>" --format='%(contents)' \
  | sed -n 's/^codex-app-sdk: //p'
```

Require exactly one full commit SHA and verify that it exists in the SDK
repository. For a legacy tag without SDK provenance, infer the baseline from
the release tag's creation time. If the current release has no tag, use the
timestamp of the resolved Codex Claw baseline commit instead. Say explicitly
that the SDK baseline was inferred:

```bash
git for-each-ref "refs/tags/v<current-version>" \
  --format='%(creatordate:iso-strict)'
git -C ../codex-app-sdk rev-list -n 1 --before='<tag-date>' HEAD
```

If no trustworthy SDK baseline can be resolved, stop and ask Nicolas. Then
inspect the SDK changes shipped since that baseline:

```bash
git -C ../codex-app-sdk log --first-parent --reverse --format='%h %s' \
  <sdk-baseline>..<sdk-head>
git -C ../codex-app-sdk diff --stat <sdk-baseline>..<sdk-head>
```

Use both histories as discovery input, then compare the release-worthy outcomes
with the Codex Claw `## Unreleased` section. Inspect relevant commit diffs when
titles are insufficient, especially SDK chat behavior, controls, shortcuts,
rendering, responsiveness, memory use, and reliability that become part of the
desktop app. Include meaningful user-visible performance improvements. Group
related changes and exclude internal plumbing, implementation details,
refactors, tests, and SDK-only documentation. Do not create or present a
per-commit disposition inventory.

Write release notes around outcomes users will notice. Do not hide a distinct
shortcut or discoverable control inside generic copy when naming it would help
users find the feature. If a change is ambiguous, ask before inventing release
copy.

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

After the commit, require both repositories to remain clean and the SDK `HEAD`
to still equal `<sdk-head>`. Do not push.

Require the target tag not to exist, then create an annotated tag on the
release-prep commit and verify that it resolves to `HEAD`:

```bash
git rev-parse -q --verify "refs/tags/v<target-version>"
git tag -a "v<target-version>" \
  -m "codex claw <target-version>" \
  -m "codex-app-sdk: <sdk-head>"
test "$(git rev-parse HEAD)" = "$(git rev-list -n 1 "v<target-version>")"
test "$(git for-each-ref "refs/tags/v<target-version>" --format='%(contents)' \
  | sed -n 's/^codex-app-sdk: //p')" = "<sdk-head>"
```

The first command must return no tag before creation. Do not move, replace, or
push an existing tag.

## 7. Hand off the build decision

Report the version, Claw commit hash, local tag, and recorded SDK commit. Then
ask Nicolas explicitly:

```text
Who should run npm run make—you or me?
```

Stop and wait. Do not start `npm run make` until he answers.

Immediately before an authorized build, require both repositories to be clean
again and verify that the live SDK `HEAD` exactly matches the commit recorded
in the release tag. Abort the build if any check fails. This final gate is
required because `npm run make` rebuilds `../codex-app-sdk` directly.
