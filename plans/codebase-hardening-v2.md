# Codex Claw codebase hardening v2

## Purpose

This plan replaces the file-splitting backlog in `plans/codebase-hardening.md`
with a deletion- and ownership-led program. It is deliberately exhaustive: a
candidate not listed here is not authorized by this plan. The objective is to
reduce decisions, duplicated policy, unsafe boundaries, and root interfaces;
smaller files are useful only when they are the consequence of clearer owners.

The execution order is:

1. prove and remove dead code;
2. correct invalid ownership and dependency direction;
3. decompose only the monoliths whose target ownership is known;
4. make type-safety rules enforce the new boundaries;
5. qualify the result with behavior, coverage, architecture, performance, and
   build evidence.

## Status and provenance

The authoritative planning state is the checked-out branch
`chore/codebase-hardening-review` at
`20a0b9298f872e1a53d16e8707bd8526776c08b8` on 2026-09-04. All comparisons,
decisions, and future ledger entries start from that branch/commit unless a
later ledger row explicitly advances it.

| Reference | Exact commit | Meaning |
| --- | --- | --- |
| Current branch and `main` when this plan was authored | `20a0b9298f872e1a53d16e8707bd8526776c08b8` | Both refs pointed at `chore: record phase one review`; the review branch did not yet isolate committed Phase 1 from `main` |
| Phase 1 foundation baseline | `6eb9cecaa961a1462176b82002d6dba3acfa2b69` | Baseline used by the completed Phase 1 quantitative review |
| Contract checkpoint baseline | `334255e600e8d581460f6ca0c6e850a46a7003c0` | Parent of contract checkpoint 1; use this exact commit to calculate the complete checkpoints 1–4 delta |
| Contract checkpoint 1 | `469d19aaf44d6fc2ff4cd383e61d3460bc8d3e0d` | Shared, Git, workspace, and connection contract owners |
| Contract checkpoint 2 | `a3992ed47cdf819e2fecb44776846f19c90397c4` | Backend contract owner |
| Contract checkpoint 3 | `f37512ab56c4fd82b43393b63ed4ef42094b34bf` | Conversation contract owner |
| Contract checkpoint 4 | `42738b90b3cbb3d6d86e4e47d0a57e8043a5f5f7` | Work contract owner |
| Last completed Phase 1 contract record | `66e1f28a692ea589b1e60ea1f1e08038f4cc2731` | `chore: record work contract extraction` |

At authoring time the only pre-existing working-tree modification was
`plans/codebase-hardening.md`; it must be preserved. Contract checkpoint 5 had
already been discarded and none of its four paths was modified. This file is
the only file authored by this planning checkpoint.

### Latest qualification evidence

This is verified evidence about the review branch, not a final qualification:

- `npm run test:ai`: 277 files / 2,103 tests passed;
- `npm run lint`: passed;
- unsigned Electron build: passed;
- the only recent full-suite timing sample was **30.25s**; it is a single run,
  not the required three-run median and therefore cannot decide performance;
- current conversation benchmark: Claw renderer replica 7.1855 Hz, 139.17ms
  mean, 134.11–144.67ms range, 10 samples; sibling SDK backend 2.1666 Hz,
  461.56ms mean, 451.73–471.07ms range, three samples;
- dependency-cycle checks previously reported zero cycles.

Latest verified workspace coverage (statements / branches / functions /
lines):

| Workspace | Verified coverage | Classification |
| --- | --- | --- |
| Core | 91.75 / 85.18 / 93.21 / 93.57 | Green against the configured 85% gate |
| Backend | 83.78 / 73.57 / 87.95 / 85.70 | Pre-existing red: statements and branches |
| Vue | 88.19 / 79.83 / 89.42 / 90.51 | Pre-existing red: branches; statements are tracked because the audit found untested orchestration even though Vue's current config does not gate statements |
| Electron | 68.33 / 67.11 / 62.69 / 70.89 | Pre-existing red in every dimension |
| Web | 96.32 / 87.27 / 95.38 / 97.68 | Green; freshly verified by 6 files / 24 tests |

The red workspaces are existing quality debt, not evidence that Phase 1 caused
a regression. Until the explicit Phase 4 remediation checkpoint, every
checkpoint must keep each workspace at or above its recorded per-dimension
baseline (regression prevention). After remediation and at final qualification,
every workspace must reach at least 85% statements, branches, functions, and
lines (debt remediation).

### Existing measurements

| Measure | Phase 1 baseline | Reviewed Phase 1 state |
| --- | ---: | ---: |
| Production files / lines | 303 / 78,213 | 330 / 81,247 including the since-discarded checkpoint 5 |
| Test/support files / lines | 274 / 64,052 | 284 / 69,585 including checkpoint 5 |
| Runtime test files / cases | 267 / 2,036 | 277 / 2,104 including checkpoint 5 |
| Core import edges | 58 | 132 |
| Decisions per function | 2.529 | 1.989 |
| Largest Core file | 2,558 lines | 1,255 with checkpoint 5; 1,389 after its discard |
| Dependency cycles | 0 | 0 |
| Full-suite reference | 25.01s original; 20.58s Phase 0 median | 26.44s latest committed boundary |

Re-measure every baseline before its checkpoint begins. These numbers are
historical evidence, not permission to claim a later gate passed.

## Decisions already made

1. **Checkpoint 5 is discarded.** Do not recreate
   `core/src/contracts/interaction.ts` or
   `core/src/contracts/settings.ts` merely to shorten the compatibility barrel.
2. **Snapshot construction, deep reducers, strict snapshot decoding, typed
   event decoding, and exhaustive event ownership are retained pending a fresh
   runtime validation on the isolated branch.** They have direct tests and
   removed real duplicated guards and unsafe ingress casts.
3. **Broad mechanical contract and monolith splitting is retired.** No target
   file size, barrel line count, or phase manifest justifies a move by itself.
4. **Scenario A is selected: retain contract checkpoints 1–4 on
   `chore/codebase-hardening-review`.** Independent audit and provisional
   validation found the moves mechanically sound, and the modules provide the
   dependency floor required by the approved typed-request, prompt, lifecycle,
   and renderer ownership work. Discarding them would recreate most of those
   seams piecemeal. Passing tests establishes compatibility, not architectural
   value; the value comes from the approved owners' concrete dependency needs.
5. **`unknown` remains correct at trust boundaries.** Type-safety work must
   validate and narrow it; it must not replace it with assertions or `any`.

## Contract checkpoints 1–4 decision

The four checkpoints changed declaration ownership without changing the 214
export public surface or migrating production consumers. Independent audit and
provisional validation found them mechanically sound and acyclic. Scenario A
is selected because the approved typed-request, prompt, lifecycle, and renderer
ownership work needs these domain dependency seams; Scenario B would discard
them only to recreate most of them piecemeal. Green tests prove behavioral
compatibility, not that architectural rationale. Do not partially retain or
discard the eight interleaved implementation and plan-record commits.

### Scenario A — selected: retain checkpoints 1–4

Retain the exact committed files:

- `core/src/contracts/shared.ts` — five common scalar/value declarations;
- `core/src/contracts/git.ts` — 19 Git contracts;
- `core/src/contracts/workspace.ts` — 12 source-folder/worktree contracts;
- `core/src/contracts/connections.ts` — ten connection contracts;
- `core/src/contracts/backend.ts` — 21 backend/runtime contracts;
- `core/src/contracts/conversation.ts` — 43 conversation, prompt, message,
  goal/plan, and subagent contracts plus their runtime constant arrays;
- `core/src/contracts/work.ts` — 34 provider, repository, work-item,
  automation, and routing contracts;
- `core/src/__tests__/contract-domains.spec.ts` only while it proves public
  compatibility and runtime constant identity.

The compatibility import `@codex-claw/core/contracts` stays public. Production
callers move to a domain module only as part of a concrete ownership change:

| Contract module | First organic direct consumers | Why the direct import is justified |
| --- | --- | --- |
| `git.ts` | Backend Git operation service and the future Vue Git workflow controller | Both own Git operations; an unrelated host barrel should not be their internal dependency |
| `workspace.ts` | Source/workspace request owner, worktree manager, and agent workspace service | These owners enforce source/worktree policy and should expose that vocabulary explicitly |
| `connections.ts` | Backend location router/remote replica and Electron connection IPC registrar | They own local/remote topology and transport selection |
| `backend.ts` | Complete typed request map, `AgentBackendDriver`, and backend runtime status replica | These are the provider/runtime boundary owners |
| `conversation.ts` | Agent prompt service, conversation service, renderer conversation namespace, and provider message adapters | They own prompt/message/session state and behavior |
| `work.ts` | Work integrations, backlog/Cockpit projections, automation runner/editor, and work-routing policy | They own repositories, items, assignments, and automation targets |
| `shared.ts` | Only domain leaves that need its declarations | It remains a low-level acyclic dependency, never a miscellaneous dumping ground |

Rules for Scenario A:

- no repo-wide import rewrite;
- no further contract module is created until a behavior owner needs it;
- the compatibility barrel may remain large if it is the useful external API;
- a direct internal import must reduce the consumer's dependency surface or
  make a forbidden dependency enforceable;
- delete or shrink `contract-domains.spec.ts` after package-boundary and direct
  owner tests replace its migration-only assertions;
- preserve runtime constant identity across owner and compatibility exports.

Migration consequence: the tree carries seven additional contract modules and
one compatibility test during the transition, but future owner changes can
adopt narrow imports without another declaration move. Measure whether internal
barrel consumers and import fan-out actually fall; otherwise Scenario A has not
earned its permanent cost.

### Scenario B — documented rollback/re-execution fallback

Construct a branch whose code state excludes these eight commits, in this
exact history order:

1. `469d19aaf44d6fc2ff4cd383e61d3460bc8d3e0d` — implementation 1;
2. `92caec4e35464d20992d2d80b5f93c991c1f48ba` — record 1;
3. `a3992ed47cdf819e2fecb44776846f19c90397c4` — implementation 2;
4. `29b9767da03f4be527c3a197bbcdd6ce9a39af9e` — record 2;
5. `f37512ab56c4fd82b43393b63ed4ef42094b34bf` — implementation 3;
6. `6c98059f115a4829ec9889158da7675304181340` — record 3;
7. `42738b90b3cbb3d6d86e4e47d0a57e8043a5f5f7` — implementation 4;
8. `66e1f28a692ea589b1e60ea1f1e08038f4cc2731` — record 4.

Do not use the earlier truncated range ending at `42738b9`: it omits the final
record commit and does not describe the complete atomic rollback. Preserve
later, unrelated Phase 1 work and rewrite the plan ledger rather than leaving
false completion records.

Remove the seven domain files above and restore their declarations to
`core/src/contracts.ts` exactly as they existed at `334255e`. Remove the
checkpoint-specific `contract-domains.spec.ts` assertions that exist only to
prove those moves. Verify all 214 public exports and all runtime constant
identities before accepting the rollback.

Scenario B does **not** reject domain contracts forever. Re-execute only these
pieces at concrete ownership seams:

| Later ownership checkpoint | Exact declaration group to move then | Required consumer migration in the same checkpoint |
| --- | --- | --- |
| Backend location routing | connection and source/worktree declarations currently assigned to `connections.ts` and `workspace.ts` | Location router, remote replica, source/workspace request owner, worktree manager |
| Typed provider request/driver boundary | the 21 declarations currently assigned to `backend.ts` | Typed request registry/map, `AgentBackendDriver`, Codex and Claude public driver surfaces |
| Prompt/conversation ownership | only prompt options/attachments/queues, renderer messages, conversation references/summaries, goal/plan, and subagent declarations needed by the new owners | Agent prompt service, conversation service, provider adapters, renderer conversation namespace |
| Git workflow ownership | the 19 declarations currently assigned to `git.ts` | Backend Git workflow service plus Vue Git operation controller |
| Work/backlog/automation ownership | only the provider/repository/item/assignment/automation/routing declarations needed by the selected slice | Work integrations plus the selected backlog, automation, or work-routing owner |
| Shared leaf extraction | a scalar/value type used by at least two low-level domains and not owned by either | Both direct domain consumers; no compatibility-only extraction |

Each re-execution uses `lossless-code-moves`, moves declarations and direct
consumers together, adds a package-boundary rule if useful, and preserves the
external compatibility barrel.

Migration consequence: immediate file/import surface decreases and the
migration-only test disappears, but later ownership checkpoints perform small,
repeated declaration moves. That repetition is acceptable because every move
then has an actual consumer and enforceable dependency direction.

### Selection rationale and fallback triggers

**Scenario A is selected.** The independent audit established mechanical
fidelity, stable public/runtime identity, and acyclic modules. More
importantly, the approved typed-request, prompt, lifecycle, and renderer
ownership work needs these domain dependency floors; Scenario B would recreate
most of them piecemeal. The passing provisional gates support behavioral
compatibility but are not the architectural justification.

Before implementation builds on those seams, retain these validation
requirements:

- the app starts and the main Codex/Claude, agent creation, Git/worktree,
  backlog, settings, and remote connection smoke paths work;
- full tests, all workspace typechecks, Knip, and cycle checks pass;
- the next two approved ownership checkpoints will directly import at least
  two of the existing domain modules;
- the team accepts the temporary compatibility test and additional import
  edges;
- there is no observed runtime constant identity or package-resolution issue.

Scenario B remains the exact rollback/re-execution fallback. Activate it only
with a separate recorded decision if validation fails because of the moves, if
no near-term approved owner consumes the modules directly, or if the modules
remain compatibility-only after the first two activated ownership checkpoints.
Record any fallback decision, exact commits, commands, and consequences in the
progress ledger.

## Execution core

The executable program is intentionally shorter than the evidence appendices:

1. finish manual validation of the isolated Phase 1 branch under selected
   Scenario A; retain Scenario B as the documented fallback;
2. review Appendix A in confidence order and activate only proven deletions or
   explicit product decisions;
3. install typed ESLint Stage L1 immediately after dead-code cleanup;
4. review Appendix B in priority order; activate a refactor only when its
   trigger, baseline, target interface, numeric improvement, and direct test
   seam are all recorded;
5. remediate existing workspace coverage debt;
6. close typed-lint debt and run final qualification.

An audit row is not a checkpoint. For every candidate, the review must choose
**keep**, **delete**, **consolidate**, or **extract**. Only **activated** rows are
added to the progress ledger and assigned commits. “Keep” is valid when a
module is deep, the boundary is correct, or extraction would add more interface
than it removes. Numeric interface/decision/dependency/direct-test targets are
set from a fresh baseline only for activated rows; the audit numbers below are
diagnostic context, not automatic exit gates.

## Appendix A — exhaustive dead-code evidence

Confidence tiers:

- **P1 — proven-safe:** static production caller search, runtime registration,
  package exports, and tests show no behavior path. May be removed after the
  listed prerequisite check.
- **P2 — probable:** no active producer or consumer, but compatibility,
  persistence, or product intent must be decided first.
- **P3 — product decision:** deliberately parked or potentially useful surface;
  do not delete merely because it is currently unreachable.
- **Keep:** audit false positive or active seam.

Every deletion checkpoint must search static imports, dynamic imports,
component registration, string registries, package exports, docs, i18n keys,
styles, assets, tests, and persisted/wire producers immediately before editing.

### P1 — proven-safe symbols and paths

| Candidate | Exact files/symbols and attached material | Prerequisite and deletion checkpoint | Validation |
| --- | --- | --- | --- |
| Snapshot façade helpers | `core/src/snapshot.ts`: private `normalizedFolder` and `folderBasename` | Confirm no same-file call and no textual/dynamic export; delete both together | Core snapshot tests, Core typecheck, Knip |
| Obsolete completion mutator | `core/src/agent-manager.ts`: exported `markWorkItemCompletionInstructionsDeliveredInSnapshot` | Confirm no production caller and no package export obligation; delete function and now-unused imports | Agent-manager and work-assignment tests, Core typecheck |
| Unused IPC alias | `core/src/ipc.ts`: `IpcChannel` | Confirm it is absent from declaration consumers and generated API docs; remove alias only | IPC tests, all-workspace typecheck |
| Unused approval preset option alias/constant | `core/src/codex-approval-presets.ts`: `codexApprovalPresetOptions` and `CodexApprovalPresetOption`; current repository search finds only their declarations | Re-run package-export and external-consumer inventory; delete both together only if they are not supported public entrypoints | Approval preset tests, Core typecheck |
| Electron folder-update wrapper | `electron/src/main/app-controller.ts`: private `updateAgentFolder` wrapper, plus its reflection-only test in `electron/src/main/__tests__/app-controller-ipc-support.spec.ts` | Confirm IPC registration calls backend request directly and no `keyof`/reflection access remains | Focused app-controller IPC tests and Electron typecheck |
| Impossible Cockpit remove-assignment chain | `vue/src/components/CockpitWorkInbox.vue`: declared `remove-assignment`; `CockpitView.vue`: listener/forwarded `remove-work-item-assignment`; `AppShell.vue`: two parent listeners and declared emit; `App.vue`: listener; `AgentWorkspace.vue`: repository assignment callback/emit where shared with the active backlog; synthetic forwarding test in `AppShell.navigation.spec.ts` | Prove Cockpit has no rendered emitter. Remove only Cockpit-specific forwarding; preserve the active repository-backlog clear-assignment path in `AgentWorkspace`/App where it has a real producer | Cockpit/AppShell/App/AgentWorkspace tests, Vue typecheck, i18n contract |
| Unused side-panel union | `vue/src/components/side-panel.ts`: exported `SidePanelState`; current search finds no consumer | Re-run public/import inventory; remove the union only, retaining its four constituent state types | Side-panel consumers and Vue typecheck |
| Unused test-harness helper | `vue/src/components/__tests__/app-shell-test-harness.ts`: `chooseCustomAgentFolder` | Confirm no split AppShell spec imports it; remove helper and helper-only imports | AppShell tests and Vue typecheck |
| Orphan visual reference | `docs/id8.png` (278,088 bytes), with no source or documentation reference | Confirm case-insensitive Markdown/HTML/build-asset search; delete the file | Docs/build link check and `git diff --check` |
| Unused Electron logger | `electron/src/main/log.ts`: private `debugMain`; backend's exported `backend/src/log.ts#debugMain` is active and must remain | Compiler `noUnusedLocals` proof plus repository search | Electron typecheck and log tests |
| Compiler-proven production imports/bindings | `backend/src/git/agent-git-workflow-service.ts`: `backendDisplayName`; `backend/src/runtime.ts`: callback `result`; `backend/src/state-persistence.ts`: `SubagentStatus`; `electron/src/main/app-controller.ts`: `BackendConversationRef`; `electron/src/main/daemon-launch-agent.ts`: `Socket`; `electron/src/preload/index.ts`: `AppPluginStatus`; `vue/src/components/AgentWorkspace.vue`: `isConversationLoading`; `vue/src/components/AppShell.vue`: `clawHostCapabilities` and `RightWorkspaceTab`; `vue/src/components/SettingsGeneralPanel.vue`: `daemonRunning`; `vue/src/components/use-app-shell-commands.ts`: `RendererSendPromptOptions`; `vue/src/shared/confetti/canvas-celebration.ts`: `startedAt` | Delete the 12 bindings only; compile with `noUnusedLocals/noUnusedParameters` scoped to production because current test fixtures contain separate noise | Affected workspace typechecks and focused runtime/UI tests |
| Unused app-icon re-exports | `vue/src/shared/icons/app-icons.ts`: `BoltIcon`, `Check`, `ChevronUp`, `Clock`, `DashboardIcon`, `Download`, `FolderPlusIcon`, `HandStopIcon`, `Info`, `MessageCirclePlusIcon`, `Maximize2`, `MicrophoneIcon`, `PaperclipIcon`, `QuoteIcon`, `RotateClockwiseIcon`, `Sparkles`, `SquareCheck`, `SquareDashed`, `SquareX`, `TargetArrowIcon` | Compiler-AST inventory confirms 20 names have no production import; re-run Vue script/import parsing and remove only aliases, never the upstream icon package | Vue typecheck, component suite, Knip |
| Orphan avatar picker | `vue/src/components/AgentAvatarPicker.vue` (55) and `vue/src/components/__tests__/AgentAvatarPicker.spec.ts` (26) | Static, async, global, glob, and string registry searches find no runtime consumer; delete component and owner-only spec, preserving shared avatar/identity assets | AgentDialog/identity picker tests, Vue typecheck, Knip, manual Agent dialog/avatar smoke |
| Orphan backend icon registry | `vue/src/shared/icons/backend-icons.ts` (36) and `vue/src/shared/icons/__tests__/backend-icons.spec.ts` (15) | Static, async, global, glob, and string registry searches find no runtime consumer; delete registry and owner-only spec, preserving directly imported icon SFCs | Vue typecheck, component tests, Knip |

The first P1 checkpoint may combine only symbols that share a workspace and
validation gate. Do not hide a failing reference by replacing removed code with
pass-through plumbing.

### P2/P3 — product-dependent orphan Vue surfaces

Current static/runtime inventory found no production inbound import, async
component resolver, global registration, glob registration, or string-based
registry for these two product-dependent groups. The two P1-safe orphan groups
are listed above:

| Surface | Files and measured size | Attached cleanup | Decision |
| --- | --- | --- | --- |
| Legacy work backlog | `vue/src/components/WorkBacklogPanel.vue` (668); `vue/src/components/__tests__/WorkBacklogPanel.spec.ts` (407) | Remove surface-specific i18n/style/icon references only after proving they are not shared | **P3.** Explicit product approval required because historical plans treated it as future-facing. Prefer deletion over refactoring if retired |
| Repository issue composer | `vue/src/components/RepositoryIssueComposer.vue` (326); `vue/src/components/__tests__/RepositoryIssueComposer.spec.ts` (101) | Remove composer-only copy, validation helpers, and styles found by post-delete Knip/RG | **P2.** Delete after confirming no intended issue-create entry point remains |

These two groups total 1,502 measured lines in the current tree. Their deletion
is two independent commits, not a single “Vue cleanup” commit.

### P3 — parked `prepare-work` / work-routing system

The model-facing registration in `backend/src/mcp/tools.ts` is commented out,
and `backend/src/mcp/__tests__/service.spec.ts` explicitly proves the tool is
not exposed. The retained lifecycle still spans:

- `backend/src/mcp/agent-coordinator.ts`: `PrepareWorkInput`,
  `PrepareWorkResponse`, `onPrepareWork`, constructor field, and `prepareWork`;
- `backend/src/mcp/service.ts`: `workRoutingResolvers`, coordinator callback,
  resolver cleanup, `resolveWorkRoutingRequest`, and `prepareWorkForAgent`;
- `backend/src/work-routing/work-routing-service.ts`;
- `backend/src/server.ts`: service construction plus
  `mcp/workRouting/respond` local/remote request handling;
- `backend/src/runtime.ts`: the MCP service is wired as the work-routing port;
- `backend/src/client-requests/client-request-registry.ts`: remote routing
  request projection/registration;
- `backend/src/connections/remote-team-service.ts`: remote request projection;
- Core contracts: `WorkRoutingRequest`, `WorkRoutingResult`, snapshot
  `workRoutingRequests`, event types and payloads;
- `core/src/backend-protocol/methods.ts#mcpWorkRoutingRespond`,
  `core/src/app-error.ts`'s four `workRouting.*` descriptors, snapshot guard
  collections, snapshot construction/runtime reduction, event decoder, and
  event ownership;
- Core snapshot construction, guards, runtime reducer, event decoder/ownership,
  and their focused tests;
- `vue/src/App.vue`: `pendingWorkRoutingRequest` and response flow, plus
  `vue/src/__tests__/App.spec.ts`;
- `vue/src/components/WorkRoutingDialog.vue`, its component spec, and
  `vue/src/i18n/messages.ts`'s `workRouting` copy;
- work-routing/backend server tests and fixtures;
- `docs/mcp.md`, `docs/agent-isolation.md`, `docs/protocol.md`, and
  `docs/backend-architecture.md` work-routing sections.

Size context for the affected owners, not a claim that every line is dormant:
agent coordinator 567 lines, MCP service 693, MCP tools 213, work-routing
service 122, client-request registry 77, remote-team service 320, server 2,761,
runtime 268, `App.vue` 627, Core contracts/work 230, snapshot construction 162,
metadata guard 531, runtime reducer 348, protocol methods 176, runtime event
payload decoder 360, and the four docs 1,368 combined. Before deletion, record
the exact line/symbol slice in each owner; never count an entire shared file as
removed work-routing code.

Decision gate:

- **Keep parked:** document the intended trigger and owner, then exclude the
  code from monolith metrics; add no new behavior.
- **Delete:** remove the complete vertical slice in one feature checkpoint,
  including persistence/wire fields only after proving no supported released
  state needs them. Preserve unrelated `RepositorySessionSourceDialog` branch
  preparation copy.
- **Revive:** requires a separate product design and is outside this hardening
  plan.

Do not delete isolated pieces while leaving snapshot/event/persistence
compatibility ghosts.

### P2 — legacy Claude print-mode CLI transport

`backend/src/claude/cli-transport.ts` is 299 lines total and mixes two things:
roughly 203 lines of obsolete `ClaudeCliTransport` implementation/helpers and
the still-active `ClaudeTurnTransport` protocol/types imported by
`agent-sdk-transport.ts`, `claude-driver.ts`, `models.ts`, and tests. The active default is
`backend/src/claude/agent-sdk-transport.ts`.

Deletion sequence:

1. Mechanically move the shared turn, permission, context, model, and transport
   types to `backend/src/claude/transport.ts`; update active imports and prove
   the move with `lossless-code-moves` hashes.
2. Search runtime construction for `new ClaudeCliTransport`, environment or
   configuration fallbacks, and exported package APIs.
3. If none exists, delete the `ClaudeCliTransport` class, CLI argument/env/
   redaction/process helpers, and
   `backend/src/claude/__tests__/cli-transport.spec.ts`.
4. Update `docs/claude.md` to remove the statement that the legacy seam remains.
5. Preserve backend `clawd` stdio, SSH stdio, Electron backend stdio, and the
   Claude Agent SDK transport; they are unrelated and active.

Validation: Claude driver, Agent SDK transport, protocol, transcript, model,
permission, full backend tests, typecheck, Knip, and a manual Claude prompt/
resume/interrupt smoke.

### P2 — protocol and persistence compatibility candidates

| Candidate | Exact footprint | Required proof before deletion |
| --- | --- | --- |
| Snapshot façade compatibility re-exports | `core/src/snapshot.ts`: `createAgentFromInput`, `createAgentInSnapshot`, `createQuickChatInSnapshot`, `selectAgent`, `updateAgentFolder`, `updateAgentFromInput`, `updateAgentOpenInApplication`, `updateAgentWorkspace`, `createDefaultRemoteConnectionsState`, `appendSteerPrompt`, and `appendSystemMessage` | These are not P1 because Core tests and the wildcard package surface can consume them. Inventory supported public imports first; if compatibility is not promised, remove only re-exports, not owner implementations. Preserve `createEmptySnapshot`, `createInitialSnapshot`, `applySnapshotMetadata`, `snapshotMetadata`, `appendUserPrompt`, `formatThreadPlanMarkdown`, and `applyMainEventToSnapshot` |
| `completionInstructionsDeliveredAt` | `core/src/contracts/work.ts`; snapshot metadata/runtime validators and reducers; backend persistence reader; related Core/backend tests | Inventory every current writer and released persisted-state producer. If no writer exists, delete reader, contract, reducers, fixtures, and migration assertions together. If old releases wrote it and restoring it still changes behavior, retain as an explicit migration field |
| `agent/folder/update` | `core/src/backend-protocol/methods.ts`; backend server request case/tests; Electron IPC/controller tests and any API member | Prove no current renderer, MCP, Web, remote, or external client calls it. Decide whether it is a supported protocol method before removing the complete request path |
| `automation/due/run` | `core/src/backend-protocol/methods.ts#automationDueRun`; `backend/src/server.ts` request case; `server-automation-requests.spec.ts`, `server-protocol-lifecycle.spec.ts`; `docs/protocol.md` | Scheduler production search finds no protocol caller; it invokes automation runtime directly. Decide whether external/manual clients may run all due automations. If no, delete method, server case, protocol docs, and endpoint-only tests while preserving scheduler behavior |
| Work-item creation (`workProvider/item/create`) | `core/src/backend-protocol/methods.ts#workProviderItemCreate`, `core/src/ipc.ts#createWorkItem`, `CodexClawApi.createWorkItem`; Backend server case/tests; Electron timeout, IPC/controller/preload path; Web `operations.ts#createWorkItem`; Vue `work-provider-state.ts`, `app-state.ts`, `App.vue`, `AppShell.vue`, `AgentWorkspace.vue#createRepositoryIssue`, `RightWorkspacePanel.vue#createRepositoryIssue`, and `RepositoryBacklogPanel.vue#createIssueAction`; associated tests | The child `RepositoryBacklogPanel` declares but never reads `createIssueAction`, yet production glue reaches all the way to Backend and Web. Product decision: restore a visible create-issue flow or delete the complete API/IPC/protocol/glue vertical slice. Do not remove only the child prop and leave the dormant upstream feature |
| Flat backend-approval and agent-less resolution compatibility | Core event payload decoder/ownership; snapshot reducer; backend/provider translation tests | Enumerate active Codex/Claude producers and released wire forms. Delete only forms no supported producer emits; retain explicit agent-less no-op if it is wire compatibility |
| Legacy full-versus-metadata snapshot fallback forms | mixed snapshot adoption in Core, Backend, Electron, Web, and Vue | Maintain strict no-downgrade decoding. Remove a fallback only after every supported sender is versioned or proven to send the canonical envelope |
| Named legacy persistence readers | `backend/src/state-persistence.ts`: `legacyThreadPlanStatus`, `legacyWorkBacklogAssignments`, `legacyWorkBacklogAssignment`, and `legacyCodexConversationRef`; their fixtures/assertions in `backend/src/__tests__/state-persistence.spec.ts` | Map each reader to the last released writer and decide the minimum supported upgrade version separately. Delete reader and fixtures only when that state shape is no longer supported; never remove all migrations as one bulk cleanup |
| Legacy collaboration-message reader | `vue/src/shared/collaboration-message.ts#legacyEnvelopeBody` and its focused tests | Identify persisted/transcript/MCP messages that still lack the structured envelope. Remove only after every supported message producer emits the canonical envelope and old stored transcripts are intentionally unsupported or migrated |
| `backend/src/work-integrations/memory-token-store.ts` | in-memory token implementation and tests/fixtures | This is a misplaced test/dev adapter, not proven dead. Relocate under tests or an explicit ephemeral adapter package if production never constructs it; do not count relocation as deletion |
| `core/src/__tests__/contract-domains.spec.ts` | current 416-line migration scaffold after checkpoints 1–4 | Scenario A: shrink after direct owner/package tests replace identity checks. Scenario B: remove checkpoint-only assertions with the atomic rollback |
| Compatibility contract barrel and wildcard Core export | `core/src/contracts.ts`, `core/package.json` exports, internal barrel consumers | Preserve the public barrel unless a versioned API decision removes it. Restrict internal imports first; do not declare the barrel itself dead |

### False positives and explicit keeps

- Keep all 55 backend event keys until a producer-and-consumer inventory proves
  a complete event vertical slice obsolete.
- Keep Codex raw response, transcript compaction, and hydration paths; they are
  active even when static tooling sees indirect protocol use.
- Keep the 66 production-imported exports in
  `vue/src/shared/icons/app-icons.ts` and directly used icon SFCs; delete only
  the 20 exact unused aliases inventoried above. Registry and render
  indirection can otherwise create Knip false positives.
- Keep `RepositoryBacklogPanel.vue`, `CockpitWorkInbox.vue`, and
  `CockpitView.vue`; these are active product surfaces. Only their proven dead
  props/events may be removed.
- Keep `backend/src/stdio.ts`, `backend/src/clawd.ts`, SSH stdio, and Electron's
  backend process client. “Legacy Claude CLI” does not mean “stdio is legacy.”
- Keep `ClaudeAgentSdkTransport` and provider-neutral `ClaudeTurnTransport`
  semantics.
- Keep persistence migration readers unless the released producer/history
  audit proves removal safe.
- Keep test harnesses that directly own behavior; delete only migration or
  reflection tests whose production path is removed.

## Appendix B — separation-of-concerns and boundary evidence

Each row is a candidate checkpoint, not permission to execute it. A checkpoint
starts only after its owner, interface, dependency direction, behavior
invariants, direct tests, and baseline metrics are recorded.

### Activation matrix

| Candidate | Activate only when | Allowed review outcome |
| --- | --- | --- |
| Typed backend request map/runtime decoding | A concrete request/result mismatch, unsafe dispatch cast, or new method exposes the untyped boundary; baseline all methods/casts first | Keep current boundary temporarily; consolidate parser/registry; extract typed map/decoder; delete obsolete methods |
| Backend server dispatcher/request owners/event coordinator/location router | A named responsibility has repeated policy or enough direct tests to move intact, and the proposed interface removes more server decisions than it adds | Keep deep server slice; consolidate duplicate policy; extract coherent owner/router/coordinator; delete obsolete cases |
| Prompt service | MCP, automation, server, or retry path bypasses the same prompt/session/queue policy | Keep existing split if policies are genuinely distinct; consolidate into prompt owner; extract provider adapter; delete bypass/duplicate helper |
| Agent lifecycle service | Create/duplicate/close/reset/cleanup policies diverge or share callbacks/state transitions | Keep existing deep lifecycle owners; consolidate lifecycle policy; extract coordinator/ports; delete obsolete route |
| Core agent-manager invariant owners | A pure invariant has multiple unrelated callers/decision clusters and can expose a smaller operation interface | Keep façade; consolidate duplicate invariant; extract pure owner; delete dead mutator |
| Event metadata registry | Adding/changing an event currently requires editing duplicate key/owner lists and derivation can remain type-safe | Keep separate registries if coupling is clearer; consolidate derivable metadata; extract payload decoder leaf; delete obsolete event only after producer audit |
| Remote replica | Snapshot cache/projection/recovery mutation is duplicated across server and remote-team/client-request owners | Keep current services; consolidate cache/projection; extract replica; delete obsolete compatibility branch |
| Persistence codecs | A migration/domain can move byte-identically with its own tests and fewer cross-domain decisions | Keep the large deep façade; consolidate duplicate readers; extract private codec; delete expired migration after release audit |
| Codex/Claude driver internals | Public driver is shallow or provider-local session/event/transcript concerns change independently | Keep a large deep provider module; consolidate wrapper/adapter; extract private provider owner; delete obsolete transport/helper |
| MCP mailbox versus workflows | Mailbox state/policy changes independently from create-agent/browser/Git/work tools or workflows bypass domain owners | Keep service if interface is deep; consolidate mailbox policy; extract mailbox/adapter; delete parked workflow slice |
| Runtime composition root | Server/domain modules construct services or environment/lifecycle wiring is duplicated | Keep current factory; consolidate construction in runtime; extract composition root; delete obsolete factory |
| Electron replica/IPC registrars/native validation | A cohesive channel family or replica behavior has direct tests and extracting it reduces controller registrations/decisions | Keep app controller slice; consolidate validators; extract registrar/replica; delete obsolete IPC |
| Constructible renderer state namespaces | A state domain can expose a stable command/read interface and direct tests without a giant shared context | Keep app-state domain; consolidate duplicate effects; extract namespace/replica router; delete dead action |
| App/AppShell/AgentWorkspace command/router cascade | Prop/emit forwarding carries semantic commands through two or more levels or command policy is duplicated | Keep template composition; consolidate commands in router/context; extract focused owner; delete obsolete relay |
| Git workflow | Flag combinations permit impossible states or merge/PR/report/cleanup transition bugs continue | Keep SFC if coherent; consolidate flags into discriminated controller; extract pure views; delete obsolete option/path |
| Backlog/Cockpit | Projection/query/routing policy is duplicated while repository and Cockpit semantics remain distinguishable | Keep distinct active surfaces; consolidate shared contracts only; extract separate projection owners; delete orphan surface/dead action |
| Image annotation | Pure session/history decisions can be tested without DOM/canvas and DOM tests dominate cost | Keep dialog if locality wins; consolidate geometry helpers; extract session/DOM adapter; delete unsupported/dead tool |
| Automations | Load/save/run race or remote/local mutation policy remains in the view and can expose a small controller | Keep coherent editor; consolidate workflow state; extract controller; delete retired graph/persona/dead endpoint |
| AgentDialog | Create/edit/acquisition validation changes independently and direct model tests would replace mounts | Keep dialog; consolidate form policy; extract form/acquisition controller; delete orphan picker/path |
| SettingsGeneralPanel | Voice/update/worktree async behavior changes independently or creates race/coverage debt | Keep simple scalar rows; consolidate async policy; extract selected controller/section; delete obsolete setting |
| Typed Web operations | A new operation requires unsafe result cast or runtime input correlation is missing | Keep the small module; consolidate operation map/decoder; extract only if an owner becomes deep; delete obsolete operation |

For an activated row, append numeric targets to the ledger before editing:
root interface cardinality, owned decision count, fan-in/fan-out or forbidden
edges, direct-owner test/assertion count, façade/component test count, and
runtime. A candidate without those targets remains review-only.

### Backend, Core, provider, and MCP owners

| Current evidence | To-be owner, interface, direction, and action | Invariants and direct tests | Exit evidence |
| --- | --- | --- | --- |
| `backend/src/driver-rpc.ts` is 466 lines/47 cases; `BackendDriverRpc`/`AgentBackendDriver` use `string + unknown -> Promise<unknown>` and six `as never` casts | **Extract/consolidate:** a discriminated `BackendRequestMap` couples method to decoded input/result. Runtime decoder returns a typed request; handler registry is exhaustive. Driver owns provider methods only; source/files/worktrees leave it. Protocol -> decoder -> typed handler -> driver, never reverse | Unknown rejected with path-safe errors; method/result correlation; cancellation/error mapping; Codex/Claude capability differences | Zero `as never` dispatch casts; every registered method in map or explicitly non-driver; exhaustive compile-time registry; direct decoder/dispatcher tests |
| `backend/src/server.ts` is 2,761 lines and routes about 102 request cases while constructing services, mutating state, persisting, routing local/remote, and publishing events | **Extract:** typed dispatcher plus coherent request owners, a location router, and backend event coordinator. **Keep:** `ClawBackendServer` as thin lifecycle façade. `runtime.ts` constructs owners; sibling request owners communicate through narrow ports, not imports | Request identity, authorization, local/remote equivalence, persistence-before-publication, event order, snapshot projection, errors and cancellation | Root switch eliminated or limited to exhaustive owner lookup; server constructor/interface cardinality decreases; direct owner tests replace most server cases; no new service bag |
| Prompt submission is split among Core `agent-chat-service`, backend `AgentPromptManager`, MCP, automations, and server callbacks | **Consolidate:** backend `AgentPromptService.submit/steer/interrupt/respond/queue/retry` owns session creation, queue transitions, persistence hooks, and event effects. MCP/automation/server call it; Core retains pure reducers/invariants only | Same prompt order, attachment policy, dictated-input metadata, queue semantics, retry, session updates, failure recovery, provider events | One mutation owner per prompt transition; no bypass from MCP/automation; direct prompt service tests; fewer callback parameters/caller branches |
| Backend lifecycle behavior is spread across server, `agent-conversation-service`, `agent-workspace-service`, driver calls, and close/delete flows | **Extract/consolidate:** `AgentLifecycleService` owns create, duplicate, close, backend-session reset, worktree/branch cleanup coordination, and status transitions through narrow Git/workspace ports | Agent IDs/names/team order, worktree initialization, close timeout/background behavior, cleanup ordering, remote ownership, no deleted-worktree prompt | Lifecycle integration tests own create/duplicate/close/cleanup; server only dispatches; one status transition policy |
| `core/src/agent-manager.ts` is 664 lines and combines lifecycle/topology, conversation resets, ordering, backlog assignment, and folder normalization | **Extract:** pure invariant owners: `agent-lifecycle`, `agent-conversation-state`, `agent-work-assignments`, and `sidebar-ordering`; keep a small façade only if callers benefit. Use named reset policies | Immutable snapshot behavior, ID/order uniqueness, selected-agent repair, reset semantics, assignment cleanup | Each decision lives in one pure owner with direct tests; façade decisions approach zero; no circular Core imports |
| Event type, decoder context, ownership partition, and renderer ignored events are exhaustively but tightly coupled across registries | **Consolidate:** one declarative event metadata registry derives runtime validation owner, reducer owner, and renderer handling category where type-safe. Do not combine provider payload decoders with application effects | Exactly 55 keys/59 variants until intentionally changed; one wire decode; path-safe errors; no-downgrade; exhaustive routing; explicit ignored events | Adding/removing event changes one metadata owner plus its payload decoder; zero duplicate key lists where derivation is safe; Core event tests remain direct |
| Remote state is projected/cached in server, `remote-team-service`, connection client, and client request registry | **Extract:** `RemoteBackendReplica` owns per-location snapshot, event adoption, agent projection, pending client requests, reconnect/invalidation. Location router asks the replica; domain owners never know SSH/stdio | Remote identity mapping, metadata/full transcript rules, reconnect recovery, pending request resolution, malformed-event recovery | One replica owner; no remote cache mutation in server; direct recovery/projection tests; local handlers transport-agnostic |
| `backend/src/state-persistence.ts` is 1,357 lines/71 functions/81 `if`s | **Keep deep public façade; extract private codecs:** app root, agents, subagents, work, topology, primitive values. Persistence may import codecs; codecs may import contracts, never server/services | Released shape migrations, normalization/repair, corrupt subrecord recovery, invalid JSON behavior, defaults, unknown additive fields | `load/save` façade stays narrow; every codec has direct migration tests; no behavior move mixed with relocation; decisions localized, not merely redistributed |
| `backend/src/codex/codex-driver.ts` is a shallow public wrapper over 1,744-line `codex-surface-adapter.ts`; Claude driver is 1,266 lines | **Consolidate public provider entrypoints, extract private owners:** session lifecycle, event translation, transcript/history, approval/tool semantics. Do not invent a shared Codex/Claude base beyond `AgentBackendDriver` | Provider-specific session resume, tools, approvals, model/effort, compaction, transcript, file events, MCP configuration | One public driver per provider; private modules have provider-local interfaces/direct tests; wrapper-to-adapter pass-through removed; no renderer/provider leakage |
| `backend/src/mcp/service.ts` owns mailbox storage/delivery and many unrelated model-facing workflows; coordinator duplicates orchestration callbacks | **Extract/consolidate:** `McpMailboxService` owns inbox/envelopes/delivery/read state. Workflow tools call backend domain services through explicit ports. HTTP/tool registration remains MCP adapter. Delete parked `prepare-work` slice if approved | Message ordering, recipient identity, unread state, tool result presentation, caller authorization, create-agent atomicity | Mailbox tests independent of create-agent/Git/browser tools; workflow policy has one backend owner; MCP adapter contains no state mutation policy |
| Service construction and environment/lifecycle wiring are split between `clawd.ts`, server constructor, and ad hoc factories | **Extract:** `backend/src/runtime.ts` composition root creates persistence, drivers, scheduler, services, router, replica, event coordinator, server. Domain modules never import runtime | Singletons, shutdown order, daemon/stdio/socket modes, injected clocks/IDs, no eager provider side effects | One construction root; server no longer `new`s domain services; runtime smoke tests cover start/stop modes; dependency graph acyclic |

### Electron and Web adapters

| Current evidence | To-be owner, interface, direction, and action | Invariants and direct tests | Exit evidence |
| --- | --- | --- | --- |
| `electron/src/main/app-controller.ts` is 1,863 lines with about 120 inline IPC registrations plus backend replica adoption and native actions | **Extract:** `ElectronBackendReplica` owns cached snapshot/event adoption; cohesive IPC registrars own agent/conversation, source/worktree/Git, settings/integrations, browser/native, and app lifecycle channels. **Keep:** app controller as composition/lifecycle root. Registrars call typed backend client/native ports only | Preload channel parity, stale/full/metadata adoption, active window delivery, native dialogs/menu, startup/shutdown, error serialization | Controller constructor/registration decisions drop materially; each channel registered once; direct registrar/replica tests; no registrar imports another registrar |
| Native path/file/browser validation is repeated around IPC handlers | **Consolidate:** native validation helpers at the Electron trust boundary; backend filesystem policy remains backend-owned. Electron validates native UI arguments, not repository policy | No arbitrary renderer filesystem access, path confinement where Electron owns it, dialog cancellation, browser bounds and annotation safety | No handler-local duplicate validators; security tests target the validator/registrar; renderer remains free of Node APIs |
| `web/src/server/operations.ts` is small (166 lines) but uses broad operation/result shapes and mirrors backend calls | **Keep size; type deeply:** discriminated Web operation map with runtime request decoding and correlated result types. Web adapter -> backend client; no domain mutation in Web | WebSocket envelope identity, malformed input recovery, authorization, pending request behavior | Zero broad result assertions; exhaustive operation registration; direct protocol/operations tests; no premature module split |

### Renderer state, shell, and feature owners

| Current evidence | To-be owner, interface, direction, and action | Invariants and direct tests | Exit evidence |
| --- | --- | --- | --- |
| `vue/src/app-state.ts` is 1,832 lines and returns 164 members; remote replica, derived projections, commands, and mutations coexist | **Extract:** constructible namespaced state (`replica`, `agents`, `conversation`, `work`, `settings`, `connections`) behind one `createAppState(platform)` façade. One replica/effect router adopts snapshots/events; namespaces expose commands and read-only state | Selection/unread repair, optimistic updates/rollback, full-vs-metadata transcript behavior, reconnect, async race handling, stable refs | Root return surface grouped and materially smaller; no global singleton dependency; each namespace direct-tested; one event-effect owner |
| `vue/src/App.vue` is 627 lines with roughly 153 bindings; `AppShell.vue` is 1,798 lines with 112 props/39 emits; `AgentWorkspace.vue` is 696 lines | **Extract/cascade by responsibility:** App owns route/onboarding/root composition; AppShell owns layout; `AppShellNavigation` owns navigation; `AgentWorkspace` owns active-agent layout; command router owns user intents and calls app-state namespaces. Prefer scoped context objects over prop/event forwarding, but do not create a giant context bag | Keyboard/menu commands, focus, active agent/team, settings/Cockpit/Automations navigation, SDK conversation wiring, dialogs, side panels, Debug actions | App/AppShell primitive prop+emit cardinality drops; no child-to-root event relays without policy; direct command/router tests own most cases; retain eight real-composition smokes |
| Renderer commands/workflows are split between `use-app-shell-commands`, shell methods, App callbacks, and component emits | **Consolidate:** typed `AppCommandRouter` maps `AppCommand`/UI intents to app-state commands and modal/navigation owners; features emit semantic intents only | Shortcut/menu parity, disabled-state policy, error reporting, modal sequencing | One exhaustive command map; zero duplicated command switch; direct router tests; components no longer know root plumbing |
| `GitWorkflowControl.vue` is 1,326 lines and models commit/push/merge/PR/report/cleanup/progress with overlapping flags | **Extract:** one discriminated Git operation controller/state machine; pure form/view components consume it. Backend remains mutation owner | Operation exclusivity, squash/push/delete ordering, handoff-before-cleanup, background progress, PR metadata/message delivery, recoverable errors | Impossible flag combinations unrepresentable; controller direct tests own transitions; component tests focus rendering; one progress model |
| `RepositoryBacklogPanel.vue` (1,310), `CockpitWorkInbox.vue` (1,087), and `CockpitView.vue` (709) duplicate some workflow but have different projections | **Extract selectively:** repository projection/query owner; Cockpit projection/selection owner; shared work-item routing contract only. Delete orphan `WorkBacklogPanel` if approved. Do not share rows whose semantics differ | Fixed height across loading/empty/list, pagination/filter/scope, selection, assignment/routing, stable item identity, error recovery | Active parents lose projection/policy decisions; direct projection/workflow tests; component mounts/time fall; no forced visual abstraction |
| `ImageAnnotationDialog.vue` is 1,298 lines (207 template/708 script/383 style), 44 functions/19 refs | **Extract:** pure `image-annotation-session` owns shapes, comments, numbering, history, export model; DOM/canvas adapter owns coordinates, zoom, scroll, pixel sampling, capture, rasterization, popup placement. Move style byte-identically if split | Image-relative coordinates, comment edit, numbering, last-annotation undo, export fidelity, browser hiding | Pure session direct tests; fewer dialog mounts; DOM adapter tests isolate geometry; no general redo/text/selection feature added |
| `AutomationsView.vue` is 804 lines while `AutomationEditor.vue` is already a coherent 340-line editor | **Keep editor; extract only remote/local state and mutation workflow from view.** Scheduler remains backend-owned. Do not revive the retired graph design | Repository multi-select, two prompts, schedule/off/team/enabled state, voice textarea, save/run/status, remote location | View owns presentation, controller owns load/save/run/races; direct workflow tests; no extra graph/persona abstraction |
| `AgentDialog.vue` is 731 lines and combines create/edit mode, repository/worktree acquisition, backend choices, validation, and submit sequencing | **Extract:** form model/validation plus workspace acquisition controller; keep dialog presentation. Reuse backend/source selectors; do not revive orphan AvatarPicker implicitly | Create vs edit defaults, new/existing worktree, reuse conflict choice, branch edit, backend/team/folder validation, init progress | Form/controller direct tests; one semantic submit; dialog component test count/mount cost decreases; no duplicate worktree policy |
| `SettingsGeneralPanel.vue` is 789 lines and combines unrelated settings, TTS model download/preview state, dictation scope, update UI, and worktree initialization | **Extract by owned setting:** speech/voice controller, update controller/status, worktree-init settings section; keep simple scalar settings in panel. Shared settings API remains one mutation boundary | Voice defaults/scope/dictated/focused, preview disabled during download, selected value width, update badge semantics, worktree-init modes/i18n | Async controllers direct-tested; panel is composition; no duplicated settings persistence; accessibility labels and disabled states covered |

## Typed ESLint ratchet

There is no TypeScript ESLint safety gate today; workspace `lint` is primarily
`tsc --noEmit`, CSS lint, and Knip. The measured production baseline contained
zero explicit `any`, six `as never` casts (driver RPC), about 22 `as unknown`
casts (including icon double-casts), about 274 other assertions, and 65 non-null
assertions. Re-measure before configuration.

### Stage L0 — classify boundaries

Create an allowlist of genuine untrusted seams:

- JSON-RPC/stdio/WebSocket/SSH payload entry;
- persisted JSON and migrations;
- Electron IPC input and native process output;
- provider SDK/raw protocol events;
- filesystem JSON/config and third-party plugin/tool payloads.

At those seams, `unknown` is required until a decoder/narrower returns a domain
type. Tests and fixtures may use explicit malformed-value helpers rather than
repo-wide casts.

### Stage L1 — install and baseline typed ESLint

Add ESLint flat configuration with TypeScript project service for Core,
Backend, Electron, Vue script blocks, and Web. Enable as errors for new code:

- `@typescript-eslint/no-explicit-any`;
- `no-unsafe-assignment`, `no-unsafe-argument`, `no-unsafe-member-access`,
  `no-unsafe-call`, and `no-unsafe-return`;
- `switch-exhaustiveness-check`;
- `no-unnecessary-type-assertion` and consistent type assertions.

Do not mass-disable errors. Record the baseline by rule/workspace/file and add
the lint command to root `npm run lint`.

### Stage L2 — remove dangerous assertion classes

- replace the six `as never` dispatch casts through the typed request map;
- prohibit `as unknown as T` outside named decoder/test-fixture helpers;
- replace broad event/request/result casts at ingress with runtime decoders;
- classify non-null assertions: prove by construction, guard, or retain with a
  narrow documented exception; warn first, then error in production;
- allow `as const`, DOM/Element Plus limitations, and generated-code assertions
  when they are local and justified.

Use restricted-syntax/import rules for `as never`, double assertions, internal
compatibility barrel imports, and cross-owner private module imports. Never
replace a lint violation with a wider type, `eslint-disable` file header, or
unvalidated generic helper.

### Stage L3 — close the ratchet

All production workspaces pass typed lint with no blanket suppressions. Inline
suppression requires a reason and is counted in the ledger. Tests use shared
malformed-boundary builders. CI runs typed lint independently of TypeScript,
Knip, and Stylelint.

Lint cannot prove request/result correlation, provider context, event envelope
identity, sequencing, persistence compatibility, or no-downgrade behavior;
typed maps, decoders, and direct tests remain required.

## Ordered execution and commit checkpoints

Every substantial relocation must use the `lossless-code-moves` skill:
inventory source/destination, move exact bytes mechanically, compare source or
AST hashes, commit/verify the move, then change boundaries or behavior in a
separate checkpoint. Never mix a large move, deletion, and semantic rewrite.

### Phase 0 — isolate and validate the retained baseline

1. Preserve the reviewed state on the current
   `chore/codebase-hardening-review` branch. Any rewriting or reverting of the
   shared `main` history requires a separate explicit history strategy and
   approval; this plan does not authorize it.
2. Scenario A is recorded as selected; Scenario B remains the exact fallback.
3. Preserve the completed provisional characterization, full test, lint,
   unsigned-build, cycle, and benchmark evidence; complete the pending manual
   app-start/smoke gate before implementation relies on the retained seams.
4. If a later explicit decision activates Scenario B, atomically remove
   checkpoints 1–4 and rerun all provisional and manual gates.

Commit boundaries:

- `chore: isolate codebase hardening baseline`
- Scenario B only: `chore: discard premature contract split`
- `chore: record hardening baseline validation`

### Phase 1 — dead code

1. P1 Core symbols/re-exports.
2. P1 Electron and Vue dead paths.
3. Four separate orphan decisions/deletions.
4. `prepare-work` keep/delete decision and, if delete, one complete vertical
   slice checkpoint.
5. Claude transport protocol move, then separate legacy implementation deletion.
6. Protocol/persistence candidates one at a time after producer/history proof.
7. Install typed ESLint Stage L1 immediately after the approved dead-code
   checkpoints. Record rather than suppress the remaining unsafe baseline.

Commit titles are scope-specific, for example:

- `chore: remove dead core compatibility code`
- `chore: remove unreachable renderer actions`
- `chore: remove orphan repository issue composer`
- `chore: isolate claude transport contracts`
- `chore: remove legacy claude cli transport`

Update this plan after each decision, including “keep” decisions and their
evidence.

### Phase 2 — backend and Core ownership review

Review Appendix B in dependency order: typed request boundary; composition
root; location/remote state; prompt/lifecycle; request/event owners; Core
invariants; persistence; MCP; provider internals. **Do not automatically
implement the list.** For each row, record keep/delete/consolidate/extract and
activate only evidence-backed checkpoints. An activated item is at least:
characterization commit, lossless move commit when needed, boundary/consumer
commit, and direct-test ownership commit. Do not run independent lanes in
parallel if both touch `server.ts`, runtime construction, snapshot contracts,
or the same test harness.

### Phase 3 — adapter and renderer ownership review

Review Appendix B in this priority: Electron boundary, renderer replica/state,
shell command cascade, then high-churn features, then Web. Activate only rows
whose gates and numeric targets are recorded. Use one feature lane at a time
unless file ownership is disjoint. Every activated UI checkpoint follows
`docs/frontend.md`, preserves i18n/accessibility, and runs direct
component/controller tests plus a small real-composition smoke.

### Phase 4 — coverage remediation, lint closure, and qualification

Coverage remediation is explicit work, not a surprise final gate:

1. **Backend coverage checkpoint:** preserve at least the recorded
   83.78/73.57/87.95/85.70 while earlier phases run; add direct tests for
   activated request/service/codec branches until statements and branches also
   reach 85%. Do not add tests solely against `server.ts` when a direct owner
   exists.
2. **Vue coverage checkpoint:** preserve at least
   88.19/79.83/89.42/90.51; raise branches to 85% through direct state,
   controller, race/error, and component-owner tests. Keep statements at or
   above 88.19 and consider adding it to the configured gate after the suite is
   stable.
3. **Electron coverage checkpoint:** preserve at least
   68.33/67.11/62.69/70.89; raise all four dimensions to 85% through replica,
   registrar, validation, lifecycle, failure, and cancellation tests.
4. Reconfirm Core and Web remain at or above their green baselines; after these
   remediation checkpoints, every workspace must be at or above 85% statements,
   branches, functions, and lines.
5. Complete typed ESLint L2/L3 after activated typed request and renderer
   boundaries exist.
6. Remove accepted temporary façades, migration specs, and internal barrel
   imports.
7. Run all final gates three times where timing is measured.
8. Append lessons learned and final metrics; mark every activated ledger row
   complete or explicitly deferred with owner/reason. Unactivated audit rows
   retain their recorded keep/delete/consolidate/extract decision but never
   masquerade as incomplete implementation.

## Verification gates

### Before every checkpoint

- `git status --short` and scoped diff review;
- exact static and dynamic consumer/producer inventory;
- focused characterization tests green before the move;
- baseline owner interface, branches/decisions, imports, direct tests, and
  runtime captured.

### After every checkpoint

- focused direct-owner and façade/composition tests;
- affected workspace typecheck and typed ESLint once installed;
- `npm run lint:css` for Vue style changes;
- `npm run lint:dead-code`;
- dependency-cycle check with the same Madge command recorded in the ledger;
- `git diff --check`;
- diff audit for unrelated/generated/coverage/build artifacts;
- plan ledger update before commit.

### Phase boundary

- `npm run test:ai`;
- `npm run typecheck`;
- `npm run lint`;
- before Phase 4 remediation, affected workspace coverage at or above its
  recorded statements/branches/functions/lines baseline; at and after the
  remediation boundary, every workspace at or above 85% in all four dimensions;
- full dependency-cycle and package-boundary tests;
- runtime comparison under quiet conditions.

### Final gate

- three clean `npm run test:ai` runs; report median and range;
- `npm run test:coverage` with every workspace at or above 85% statements,
  branches, functions, and lines;
- `npm run typecheck` and typed ESLint with no blanket suppressions;
- `npm run lint`, Stylelint, Knip, package-boundary tests, and Madge green;
- `npm run build:backend`;
- `npm run build:web`;
- `CODEX_CLAW_SKIP_SIGNING=1 npm run build`;
- manual desktop smoke: first-run/auth, existing-auth startup, create agent and
  worktree, prompt/stream/approval, Git status/operation, backlog/Cockpit,
  settings, Claude prompt/resume/interrupt, remote reconnect if configured;
- clean worktree except the explicitly preserved user modification;
- review against `docs/architecture.md`, `docs/protocol.md`, `docs/testing.md`,
  and `docs/frontend.md`.

Performance is a non-regression gate, not a race for the smallest number. Use
three quiet full-suite runs. Compare against both 25.01s original and 20.58s
Phase 0 medians: at or below 25.01s passes; 25.01–28.76s requires an explained
scope reduction or demonstrated environmental variance; above 28.76s blocks
the phase. Feature/direct-owner specs should become materially faster when
mount-heavy façade tests are replaced, but no assertion may be weakened for
speed.

## Progress ledger

Update this table at the end of every checkpoint. A checkbox or commit without
the evidence columns is incomplete.

| Date | Scenario/phase/checkpoint | Status | Baseline -> result | Owner/interface/decision change | Verification and timing | Commit | Findings/follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-04 | Phase 0: review-branch isolation | Complete | `chore/codebase-hardening-review` preserves HEAD `20a0b9298f872e1a53d16e8707bd8526776c08b8` | Establishes the review branch as the hardening state; does not rewrite shared `main` | Branch/ref/status inspection | — | Any shared-history rewrite/revert requires a separate strategy and approval |
| 2026-09-04 | Phase 0: checkpoint 5 disposition | Complete | Four-file working diff -> absent | Discarded the interaction/settings compatibility-only split; checkpoints 1–4 unchanged | Status/path/diff inspection | — | Do not recreate checkpoint 5 merely to shorten the barrel |
| 2026-09-04 | Plan v2 authoring | Complete | Prior mechanical plan -> exhaustive deletion/ownership/type-safety plan | Preserves all candidates while requiring activation gates and Scenario A/B consequences | Markdown structure/path/table sanity and `git diff --check` | — | Preserve modified `plans/codebase-hardening.md` |
| 2026-09-04 | Independent plan and baseline review | Complete | Initial v2 draft -> corrected exhaustive inventory and staged gates | Corrected rollback provenance, candidate classifications, activation policy, coverage debt, and branch-history policy | Independent review findings reconciled against source | — | Exhaustive inventories remain appendices; review does not itself authorize a candidate |
| 2026-09-04 | Phase 0: Scenario A decision | Complete | A/B decision pending -> Scenario A selected | Keeps checkpoints 1–4 as the dependency floor for approved typed-request, prompt, lifecycle, and renderer ownership; Scenario B remains exact fallback | Mechanical fidelity, export/runtime identity, cycle, consumer, and ownership-needs audit | — | Passing tests support compatibility; architectural value is the concrete dependency floor, not greenness alone |
| 2026-09-04 | Phase 0: provisional qualification | Complete | Review branch at `20a0b929…` | No ownership change; qualifies the branch provisionally before manual smoke and coverage remediation | `test:ai` 277 files / 2,103 tests passed; lint passed; unsigned build passed; cycles zero; benchmarks 7.1855 Hz Claw and 2.1666 Hz SDK; one 30.25s full-suite timing is not a median | — | Backend/Vue/Electron coverage debt and manual desktop smoke remain pending; this is not final qualification |
| — | Phase 0: retained snapshot/event manual validation | Pending | — | — | — | — | Must include manual app smoke; provisional automated gates alone are insufficient |
| — | Phase 1: P1 Core dead code | Pending | — | — | — | — | — |
| — | Phase 1: P1 adapter/UI dead code | Pending | — | — | — | — | — |
| — | Phase 1: orphan decisions | Pending | — | — | — | — | Four independent decisions |
| — | Phase 1: parked work-routing decision | Pending | — | — | — | — | Keep/delete/revive gate |
| — | Phase 1: legacy Claude CLI | Pending | — | — | — | — | Protocol move precedes deletion |
| — | Phase 1: compatibility candidates | Pending | — | — | — | — | One producer/history audit per candidate |
| — | Phase 1: typed ESLint L1 | Pending | — | — | — | — | Runs immediately after dead-code cleanup |
| — | Phase 2: backend/Core ownership review | Pending | — | — | — | — | Add only activated candidates as new rows |
| — | Phase 3: adapter/renderer ownership review | Pending | — | — | — | — | Add only activated candidates as new rows |
| — | Phase 4: Backend coverage remediation | Pending | 83.78/73.57/87.95/85.70 -> 85+ each | — | — | — | Pre-existing debt; preserve baseline at every prior checkpoint |
| — | Phase 4: Vue coverage remediation | Pending | 88.19/79.83/89.42/90.51 -> branch 85+, other measures non-regressing | — | — | — | Track statements even before it becomes a configured gate |
| — | Phase 4: Electron coverage remediation | Pending | 68.33/67.11/62.69/70.89 -> 85+ each | — | — | — | Pre-existing debt; direct adapter-owner tests |
| — | Phase 4: typed ESLint L2/L3 | Pending | — | — | — | — | — |
| — | Final qualification | Pending | — | — | — | — | — |

## Definition of complete

The program is complete only when all of the following are evidenced in the
ledger:

- every dead-code candidate is deleted, retained with evidence, or deferred by
  an explicit product/compatibility decision; no candidate silently disappears
  from the plan;
- every selected mixed-concern row has one named owner, a narrow interface,
  correct dependency direction, and direct tests;
- root orchestrators contain composition/routing rather than domain policy;
- no new shallow pass-through, giant options/controller bag, or sibling-owner
  dependency replaced the original monolith;
- request/event/operation dispatch is correlated and exhaustive without
  `as never` or double assertions;
- `unknown` exists only at named trust boundaries and is decoded once;
- dependency cycles remain zero and forbidden imports are enforced;
- direct-owner tests carry detailed behavior; façade/component tests cover
  only composition and representative integration;
- full runtime is no worse than the accepted performance gate;
- every workspace reaches at least 85% statements, branches, functions, and
  lines after the explicit coverage-remediation checkpoint;
- final typecheck, typed ESLint, Stylelint, Knip, builds, full tests, and manual
  smoke pass;
- temporary compatibility façades/tests are removed or deliberately accepted;
- lessons learned and before/after metrics are appended.

Measure success with owner and interface reduction, decisions removed from
callers, dependency direction, direct-test ownership, cycles, runtime, and net
complexity. Raw LOC may rise for decoders or focused tests; it is a failure if
LOC/file count rises without reducing decisions or coupling. Report at least:

- root constructor/prop/emit/API member counts before and after;
- request/event/command switch and unsafe assertion counts;
- imports/fan-in/fan-out and cycles;
- decisions per function for selected owners and their callers;
- direct-owner versus façade tests, mounts, and runtime;
- production/test net LOC, including deleted compatibility and orphan code;
- coverage by workspace and full-suite timing median/range.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Retaining checkpoint 1–4 adds files/imports without ownership value | Scenario A requires near-term direct consumers and measures internal barrel reduction; otherwise choose/revisit Scenario B |
| Atomic rollback accidentally removes later Phase 1 work | Compute exact range from `334255e`, inspect tree diff, preserve later snapshot/event commits, and verify public exports/runtime identities |
| Static dead-code tools miss dynamic Vue/icon/MCP registration | Search import, async/global/glob/string registries and package exports; manual smoke product surfaces |
| Persistence/wire cleanup breaks upgraded installations or mixed versions | Producer/history audit, fixtures from released shapes, no-downgrade tests, and explicit compatibility decisions |
| Decomposition creates more plumbing than clarity | Require owner/interface/decision metrics before and after; reject shallow modules and giant context/service bags |
| Parallel agents collide in roots | Serialize any work touching server/runtime/contracts/App/AppShell; parallelize only disjoint leaf owners and independently review every diff |
| Typed lint becomes suppression theater | Baseline by rule/file, classify trust boundaries, no blanket disables, fix typed maps/decoders first, count exceptions |
| UI test speed improves by stubbing away integration | Keep direct real-owner tests plus named real-composition smokes; preserve assertion intent and manual smoke |
| Manual validation is skipped because tests are green | Scenario decision and final qualification explicitly require desktop startup and critical workflow smokes |

## Lessons carried forward

1. Moving code is not the same as improving architecture. A new module earns
   its existence only when it owns policy or creates enforceable dependency
   direction.
2. Deletion has higher leverage than decomposition. Prove obsolete vertical
   slices before designing abstractions around them.
3. Large files are symptoms, not acceptance criteria. A large deep module can
   be healthier than many shallow coordinators.
4. Characterization tests belong to the behavior owner. Migration-only tests
   and compatibility façades must have an explicit removal condition.
5. Trust-boundary `unknown` is sound design. Unsafe assertions after the
   boundary are the debt.
6. Contract modules should emerge with their consumers. Barrel size is not an
   architecture metric.
7. Performance evidence needs repeated quiet measurements; one full-suite run
   cannot justify a keep/revert decision.
8. Plans must record “keep” and product-decision outcomes as carefully as
   deletions and commits, or the audit ceases to be exhaustive.
