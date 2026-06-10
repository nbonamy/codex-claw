# Source Folder Feature Plan

## Summary

Add Skwad-style source folder support to Codex Claw as a global discovery setting, independent of teams and agents. The feature includes Settings configuration, shallow git repo/worktree discovery, recent repos, repo/worktree selection in the agent dialog, worktree creation, and MCP tools for agents.

## Key Changes

- Add source folder state to the app snapshot:
  - `sourceFolder.path`
  - `sourceFolder.initialized`
  - `sourceFolder.recentRepoNames`
- Add shared types:
  - `SourceRepository { name, path, worktrees }`
  - `SourceWorktree { name, path }`
  - `CreateSourceWorktreeInput { repoPath, branchName, destinationPath? }`
- Add IPC/preload APIs:
  - `chooseSourceFolder()`
  - `listSourceRepositories()`
  - `chooseSourceWorktreeDestination(repoPath, suggestedName)`
  - `createSourceWorktree(input)`
- Extend `UpdateSettingsInput` with `sourceFolder.path`.
- Extend MCP with Skwad-parity source tools:
  - `list-repos`
  - `list-worktrees`
  - `create-worktree`
  - `create-agent` with `repoPath`, `createWorktree`, `branchName`, optional `destinationPath`, and backend/name/avatar inputs.

## Implementation

- Main process:
  - Add a source repository service that auto-detects once from Skwad's candidate list, expands `~`, scans only direct children, groups worktrees by parent repo, ignores orphan worktrees, sorts repos alphabetically, and maintains a best-effort debounced watcher.
  - Add a git worktree service using Node child process `git worktree add -b <branch> <destination>` with injectable runner for tests.
  - Persist source folder settings and recent repo names; recent repos are repo names only, max 5.
  - Validate all filesystem and git operations in main; renderer never scans directories or runs git.
- Renderer:
  - Add Source Folder controls to General settings: current path, clear, choose.
  - Update `AgentDialog` to use repo/worktree selection when the configured source folder is valid.
  - Keep "Browse Other..." available even when repo discovery is enabled.
  - Add a `NewSourceWorktreeDialog` for branch name, suggested destination, destination browse, create, loading, and error states.
  - Fall back to the existing folder picker when source folder is empty or invalid.
- MCP/team behavior:
  - Source folder remains global and does not affect team membership.
  - MCP `create-agent` creates agents in the caller's team by default.
  - Worktree creation returns the created worktree and refreshes discovery before follow-up agent creation.
- Docs:
  - Update `/Users/nbonamy/src/codex-claw/docs/architecture.md` with source folder ownership, discovery rules, and MCP source-folder tools.

## TDD And Verification

- First add failing tests for:
  - Source repo scanning: empty/invalid folders, direct clone detection, branch name from `HEAD`, detached/missing `HEAD`, worktree grouping, prefix stripping, orphan worktree ignored, alphabetical sorting, tilde expansion.
  - Source folder persistence: sanitize settings, preserve recent repo names, initialize missing state, do not re-detect after clear.
  - Settings update and IPC channel contracts.
  - App controller: auto-detect once, choose/update source folder, list repos, create worktree, refresh cache, create agent from repo/worktree.
  - MCP coordinator/tools/http server: `list-repos`, `list-worktrees`, `create-worktree`, `create-agent`.
  - Settings UI: render path/not configured, choose, clear.
  - Agent dialog: fallback picker, repo/worktree picker, recent repo ordering, browse other, new worktree success/error.
- Focused gates during implementation:
  - `npx vitest run src/main/source-repositories.spec.ts src/main/git-worktrees.spec.ts`
  - `npx vitest run src/main/__tests__/state-persistence.spec.ts src/shared/__tests__/settings.spec.ts src/shared/__tests__/ipc.spec.ts`
  - `npx vitest run src/main/mcp/__tests__/agent-coordinator.spec.ts src/main/mcp/__tests__/http-server.spec.ts`
  - `npx vitest run src/renderer/components/__tests__/AgentDialog.spec.ts src/renderer/components/__tests__/SettingsView.spec.ts`
- Final gates:
  - `git diff --check`
  - `npm run lint`
  - `npm test`

## Execution Progress

- [x] Added source-folder shared state, settings normalization, snapshot
  defaults, IPC contracts, and persistence coverage.
- [x] Added main-process source repository discovery and git worktree creation
  services with focused tests.
- [x] Wired AppController, preload, renderer state, Settings, and Agent Dialog
  through typed app-owned APIs.
- [x] Refined the Agent Dialog source controls to match Skwad's picker model:
  repository selection with bottom custom-folder action, worktree selection with
  bottom new-worktree action, and a read-only resolved path field.
- [x] Refined New Worktree creation so the destination path resolves
  automatically from the selected repo parent plus the normalized branch name,
  while still allowing an explicit folder override from the dialog.
- [x] Added Claw MCP source-folder tools for repository listing, worktree
  listing, worktree creation, and agent creation.
- [x] Updated source-folder architecture docs.
- [x] Passed focused source-folder tests:
  `npx vitest run src/main/__tests__/source-repositories.spec.ts src/main/__tests__/git-worktrees.spec.ts src/shared/__tests__/settings.spec.ts src/shared/__tests__/ipc.spec.ts src/main/__tests__/state-persistence.spec.ts src/main/mcp/__tests__/agent-coordinator.spec.ts src/renderer/components/__tests__/AgentDialog.spec.ts src/renderer/components/__tests__/SettingsGeneralPanel.spec.ts`
- [x] Passed adjacent regression tests:
  `npx vitest run src/renderer/__tests__/app-state.spec.ts src/renderer/components/__tests__/AppShell.spec.ts src/main/mcp/__tests__/http-server.spec.ts src/main/__tests__/app-controller.spec.ts src/main/__tests__/snapshot-service.spec.ts src/shared/__tests__/snapshot.spec.ts`
- [x] Passed final gates: `git diff --check`, `npm run lint`, `npm test`.

## Commit Checkpoints

- `feat: add source folder persistence and discovery`
- `feat: expose source folder ipc and settings`
- `feat: add source repo picker to agent dialog`
- `feat: add source worktree creation`
- `feat: add source folder mcp tools`
- `chore: document source folder architecture`

## Assumptions

- "Everything" means full Skwad source-folder parity for Codex Claw, excluding Skwad-only Add Dir because Codex Claw has no matching surface yet.
- Discovery is read-only and shallow; worktree creation is the only git write.
- Invalid or empty source folder is allowed and simply disables repo/worktree discovery.
- Existing dirty worktree changes stay untouched; implementation should stage only source-folder files.

## Key Learnings

- Keep source-folder discovery as app-owned main-process state. It is useful to
  both renderer UI and MCP tools, but it should not leak into backend protocol
  code or become part of team membership.
- Skwad's shallow filesystem model ports cleanly: direct child scanning plus
  `.git` file parsing gives enough repo/worktree structure without running git
  during read discovery.
- Recent source repositories are safer as display names rather than paths. They
  remain stable enough for ordering, while path changes still flow through the
  fresh discovery result.
