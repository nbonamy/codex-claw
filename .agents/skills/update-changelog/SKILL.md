---
name: update-changelog
description: Audit Korus and its locked published codex-app-sdk Git histories, curate CHANGELOG.md Unreleased from user-visible outcomes, and recommend a semantic version. Use only when Nicolas explicitly requests a changelog audit or prepare-release invokes it; never during ordinary implementation, review, commit, or push work.
---

# Update Changelog

Treat changelog curation as a deliberate release operation. Ordinary work must
not add entries incrementally; reconstruct `## Unreleased` from committed Git
history when this skill is explicitly invoked.

## 1. Require clean release inputs

Before any mutation, require Korus to be clean:

```bash
git status --short
```

Abort if the command returns any entry. Do not stash, discard, stage,
commit, or absorb existing changes.

Confirm Korus's branch/upstream without pulling or switching branches. Resolve
`<sdk-version>` from `package-lock.json`'s installed `@codex-app-sdk/backend`
entry and require all SDK workspace dependencies to use that same published
version. Resolve `<sdk-head>` with `npm view @codex-app-sdk/backend@<sdk-version>
gitHead --registry=https://registry.npmjs.org`. Require a full commit SHA.
The audit ends at that published commit, even if the sibling checkout is newer.
Use the sibling repository as a read-only Git object database if available;
otherwise use the SDK repository's GitHub compare/commit APIs. Do not require
a sibling checkout for builds or alter its worktree.

Read `<current-version>` from the root `package.json`.

## 2. Resolve trustworthy audit baselines

Prefer `v<current-version>` as the Korus baseline:

```bash
git rev-parse --verify "refs/tags/v<current-version>"
```

If absent, find the commit that introduced the current release heading:

```bash
git log -n 1 --format=%H -S "## [<current-version>]" -- CHANGELOG.md
```

Stop and ask Nicolas if neither baseline exists.

Read the SDK baseline from the current Korus release tag annotation:

```bash
git for-each-ref "refs/tags/v<current-version>" --format='%(contents)' \
  | sed -n 's/^codex-app-sdk: //p'
```

Require exactly one full commit SHA and verify it exists in the SDK repository.
If the annotation is absent, first resolve the SDK version from the baseline
Korus lockfile and obtain that version's npm `gitHead`. For a legacy local SDK
lockfile without published provenance, infer the SDK baseline from the tag's
creation time. If the current release has no tag, use the resolved Korus
baseline commit time instead:

```bash
git for-each-ref "refs/tags/v<current-version>" \
  --format='%(creatordate:iso-strict)'
git -C ../codex-app-sdk rev-list -n 1 --before='<baseline-date>' <sdk-head>
```

State explicitly when the SDK baseline was inferred. Stop and ask Nicolas if
no trustworthy SDK baseline can be resolved.

## 3. Audit both histories

Inspect all first-parent commits and aggregate diffs:

```bash
git log --first-parent --reverse --format='%h %s' <app-baseline>..HEAD
git diff --stat <app-baseline>..HEAD
git -C ../codex-app-sdk log --first-parent --reverse --format='%h %s' \
  <sdk-baseline>..<sdk-head>
git -C ../codex-app-sdk diff --stat <sdk-baseline>..<sdk-head>
```

Use commit titles only for discovery. Inspect relevant diffs when the outcome
is ambiguous, especially SDK chat behavior, controls, shortcuts, rendering,
responsiveness, memory use, and reliability that ship inside Korus.

Compare the discovered outcomes with the existing `## Unreleased` section,
but do not trust incremental notes as complete. Curate one release-level view:

- include user-visible features, discoverable controls and shortcuts, fixes,
  compatibility changes, and meaningful performance or reliability gains;
- group related work around outcomes rather than commits;
- keep distinct discoverable features distinct when that helps users find
  them;
- exclude internal plumbing, refactors, tests, dependency churn, generated
  files, and SDK-only documentation unless users experience the result;
- avoid a per-commit disposition inventory;
- never invent release copy from an ambiguous diff—ask Nicolas instead.

## 4. Rewrite Unreleased

Use `apply_patch` to replace the body of `## Unreleased` with the audited notes.
Keep the heading and existing release history. Do not create a version heading,
edit package versions, refresh the lockfile, generate renderer release notes,
commit, tag, push, build, or publish.

If there are no release-worthy outcomes, leave `## Unreleased` empty and report
that no release is recommended.

## 5. Recommend a version from evidence

Classify the highest release impact represented by the audited notes:

- **No release:** internal, test, documentation, or packaging-only changes with
  no shipped user outcome.
- **Patch:** compatible fixes, reliability, security, or performance
  improvements without a new discoverable capability.
- **Minor:** new user-visible features, workflows, controls, shortcuts, or
  compatible capability additions. While the current major is `0`, use a minor
  bump for incompatible product or contract changes too.
- **Major:** incompatible changes after `1.0.0`, or an explicit major product
  milestone Nicolas has approved.

Recommend the exact next plain semantic version from `<current-version>`. Do
not choose a higher bump merely because the diff is large.

## 6. Verify and return the audit result

Run:

```bash
git diff --check
git status --short
```

Only `CHANGELOG.md` may be modified in Korus; the SDK repository is read-only.
Recheck that the locked SDK version/provenance did not change and review the
complete changelog diff.

Return a concise audit result for Nicolas or the calling release skill:

- current version and exact recommended version, or `no release`;
- semantic-version rationale tied to concrete user-visible outcomes;
- Korus baseline and `HEAD`;
- SDK baseline and `<sdk-head>`, noting any inferred baseline;
- whether `CHANGELOG.md` changed;
- the reviewed release-note section.
