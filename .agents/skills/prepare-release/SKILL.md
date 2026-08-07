---
name: prepare-release
description: Prepare a Codex Claw desktop release by invoking the repo-level update-changelog audit, presenting an evidence-backed semantic-version recommendation, synchronizing package versions, freezing generated release notes, committing release preparation, and creating an annotated local tag with SDK provenance. Use when Nicolas asks to prepare, cut, freeze, or version a Codex Claw release, including $prepare-release with or without a version.
---

# Prepare Release

Prepare the release commit and local annotated tag only. Do not build, push,
publish, or upload until Nicolas separately chooses who will build it.

## 1. Require clean, reproducible repositories

Codex Claw's release build consumes the live sibling checkout at
`../codex-app-sdk`. Before any mutation, require both repositories to be clean:

```bash
git status --short
git -C ../codex-app-sdk status --short
```

Abort if either command returns any entry. Do not stash, discard, stage,
commit, or include existing changes.

Confirm the current branch and upstream in both repositories without pulling
or switching branches. Require the SDK `HEAD` to equal its upstream exactly.
Record the full SDK `HEAD` as `<sdk-head>`.

## 2. Invoke update-changelog first

Read `../update-changelog/SKILL.md` completely and execute its workflow before
resolving the target version. This is mandatory even when Nicolas supplied a
version with the release request.

Require its result to contain:

- a non-empty, fully audited `## Unreleased` section;
- Claw and SDK baseline/HEAD evidence;
- an exact semantic-version recommendation and rationale;
- `<sdk-head>` matching the value recorded in step 1.

Stop when the changelog audit recommends no release or cannot establish a
trustworthy baseline. After the audit, only `CHANGELOG.md` may be dirty.

## 3. Recommend and confirm the target version

Present the changelog audit's recommendation before editing version-owned
files. Cite the highest-impact user-visible outcomes that justify patch, minor,
or major scope, and state the proposed transition, for example:

```text
Recommendation: 0.6.0 -> 0.7.0 (minor)
Evidence: shared resource workflow; new reconnect UX; execution-plan lifecycle.
Prepare 0.7.0?
```

If Nicolas supplied a target version, still compare it with the audited
recommendation and explain any difference. Use the supplied version only after
that evidence is presented and the version is validated. If no version was
supplied, pause for explicit confirmation of the recommendation or an alternate
version; never ask for a blind version number before the audit.

Require plain semantic version form such as `0.7.0`, without a `v` prefix. The
target must be greater than the current root package version and absent from
existing `CHANGELOG.md` headings and Git tags.

## 4. Freeze the release

Move the reviewed Unreleased body under today's local-date heading:

```markdown
## Unreleased

## [<target-version>] - YYYY-MM-DD

<reviewed release notes>
```

Update all version-owned files together with `apply_patch`:

- `package.json`
- `core/package.json`
- `backend/package.json`
- `vue/package.json`
- `electron/package.json`
- the internal `@codex-claw/*` dependencies in workspace manifests

Mechanically refresh the lockfile:

```bash
npm install --package-lock-only --ignore-scripts
```

Generate the frozen renderer artifact:

```bash
npm run release-notes:generate
```

Require the generated JSON version to equal the target and its Markdown to
exactly represent the new changelog release section.

## 5. Verify the release-prep diff

Run:

```bash
npm run release-notes:check
git diff --check
git status --short
```

Only these paths may be modified:

- `CHANGELOG.md`
- `package.json`
- `package-lock.json`
- `shared/package.json`
- `backend/package.json`
- `electron/package.json`
- `vue/src/generated/release-notes.json`

Abort if another path changed. Review the complete diff and confirm every
manifest and lockfile workspace version equals the target.

## 6. Commit and tag release preparation

Stage only the seven allowed paths. Review `git diff --cached --check`,
`git diff --cached --stat`, and the complete cached diff. Commit with exactly:

```text
chore: release prep
```

After the commit, require both repositories to remain clean and the SDK `HEAD`
to still equal `<sdk-head>`. Do not push.

Require `v<target-version>` not to exist, then create an annotated tag on the
release-prep commit:

```bash
git tag -a "v<target-version>" \
  -m "codex claw <target-version>" \
  -m "codex-app-sdk: <sdk-head>"
```

Verify the tag resolves to `HEAD` and its annotation contains exactly one
`codex-app-sdk: <sdk-head>` provenance line. Never move, replace, or push an
existing tag.

## 7. Hand off the build decision

Report the version, Claw commit hash, local tag, and recorded SDK commit. Ask
Nicolas explicitly:

```text
Who should run npm run make—you or me?
```

Stop and wait. Do not start `npm run make` until he answers.

Immediately before an authorized build, require both repositories to be clean
again and verify that the live SDK `HEAD` exactly matches the commit recorded
in the release tag. Abort if any check fails because `npm run make` rebuilds
`../codex-app-sdk` directly.
