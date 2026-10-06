# Agent Isolation

Design note: the shared-checkout warning is **not implemented**. Today agent
creation permits several agents in one folder without a warning and no policy is
persisted. Treat everything below as direction until an isolation policy matrix is
agreed.

## Problem

An agent is attached to a folder, so two agents on one Git checkout mutate the same
files, index, branch and build outputs. Isolation choices appear in several places
(repository session creation, backlog assignment, duplicate/fork, automations, MCP
`create-agent`), and all are the same question: when should work share a checkout,
and when should Korus require or recommend isolation? Independent per-surface
warnings would produce inconsistent policy.

## Vocabulary

- **Checkout:** one working-tree folder with its files, index, branch and
  uncommitted changes. **Worktree:** another checkout of the same repository sharing
  objects and refs but not files or index. Worktrees are the intended isolation
  boundary for concurrent coding even though they are not perfect process isolation.
- **Shared checkout:** two or more open agents on the same checkout *at the same
  execution location*. Teams are organizational, not isolation boundaries; identical
  paths on different hosts are different checkouts; Quick Chats have no workspace.
- **Repository identity:** the credential-free remote identity when available,
  otherwise a stable local root.

## Agreed Direction

An explicit, user-driven action that would create another agent in a checkout used
by any open agent (every team, same location, working or idle) warns first, naming the
checkout and listing the conflicting agents with their teams, and explaining that
files, uncommitted changes, branch switches, commits, resets and outputs are shared.
The dialog has **Cancel** and **Continue** plus a radio group: ask again (default),
don't ask again for this repository, don't ask again for any repository. Suppression
must be reversible in Settings, with a discoverable reset for repository exceptions.

## Architecture Direction

Assessment lives in `daemon`, which owns agent state, locations, filesystem and Git
identity, persistence, MCP and automations. The renderer receives an app-owned
assessment (target kind, repository and checkout identity, sharing agents and teams,
same-location flag, safe/warnable/disallowed, applicable preference, available
alternatives such as a new worktree) and never infers checkout identity from path
strings. Confirmation and mutation use one authoritative decision path: a renderer
preflight alone would be bypassed by MCP, automations, remote clients and races.

## Open Questions

1. Do duplicate and fork (which often keep the folder on purpose) always warn, use
   different copy, or offer isolation inline?
2. Does the warning apply to plain folders, which have no remote identity for
   repository-level suppression?
3. Does "don't ask again for this repository" follow a repository across machines and
   clones, or only one execution location? How are exceptions listed and reset?
4. What must automations enforce (worktree-only, per-automation policy, or a blocked
   run with a resolution path; silently sharing an active checkout is the weakest)?
5. What does MCP `create-agent` do when its target checkout is in use? A model must
   not bypass a user safety preference.
6. Should Korus offer navigating to the existing agent instead of creating another?

Next step: resolve these into one policy matrix, define the backend contract and
persistence, then implement every creation surface against it.
