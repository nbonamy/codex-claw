# Antigravity Provider Integration

Status: Phase 0 executed on 2026-10-05 against both CLI and Google's ACP runtime,
following source review of T3 and Synara. **Select ACP for implementation**:
live personal OAuth, approvals, session-scoped MCP, cold history replay and
cancellation work. Extended assessment also resolves attachments, skills,
planning, workflow mechanics and unsupported conversation controls below.
This is transport qualification, not production readiness.
No Korus provider has been implemented.
Repository baseline: `3ec19e49`.

## Objective and scope

Add Google Antigravity as a first-class provider alongside Codex and Claude Code,
with an honest capability surface rather than assumed feature parity. Keep the
provider's native authentication and execution harness. Do not silently substitute
Gemini API billing or a custom agent loop.

The selected transport is native TypeScript driving Google's `antigravity-acp`
runtime over ACP. The CLI probes below remain valid evidence for `agy` 1.2.17,
not a verdict on all Antigravity transports. T3's implementation supplies concrete
approval, per-session MCP, profile-isolation and cancellation mechanisms, now
exercised below. Native `session/load` supplies cold transcript hydration; the
Antigravity provider host must own replay normalization and its conversation replica.

```text
Vue shared conversation UI + Antigravity-owned replica
    -> app-owned client contracts (Electron preload or Web transport)
    -> daemon (backend/): driver + Antigravity conversation host
    -> ACP transport: Google's antigravity-acp runtime
```

Electron stays a desktop adapter. Provider frames travel in app-owned routing
envelopes; the generic app reducer must not become a transcript reducer. Keep
Codex conversation behavior SDK-owned. Antigravity protocol interpretation and
persistence belong to its provider host, not renderer branches or Electron.

## Phase 0: measured CLI evidence (not ACP)

### Runtime and method

- Initially, both shell lookup and Korus's actual `resolveRuntimeExecutable('agy')`
  returned no CLI. The desktop app was present; that is not a CLI installation.
- Downloaded the official darwin/arm64 1.2.17 artifact to a temporary directory
  and verified its SHA-512 against Google's release manifest. Did not run the
  global installer or modify shell profiles.
- Nicolas then installed `agy`. All model/session probes below used
  `/Users/nbonamy/.local/bin/agy`, version **1.2.17**; Korus's runtime discovery
  subsequently resolved that path.
- Used `gemini-3.8-flash-low`, default `request-review` permissions, scratch cwd
  `/tmp/korus-antigravity-phase0.ACP1s1`, a 30-second CLI timeout, and a bounded
  parent-process timeout. No dangerous-skip flag, credential extraction,
  user-global settings changes, app restart, or real-project edits were used.
- Authentication worked with the existing native login. This proves an
  authenticated request, not first-run login, expiry recovery, or isolated auth.
- Workspace isolation is **not home isolation**: the CLI saved probe sessions in
  its normal `~/.gemini/antigravity-cli/conversations/` directory. An exploratory
  `ANTIGRAVITY_APP_DATA_DIR` override did not redirect that conversation storage;
  it must not be treated as a supported isolation contract.

### Results

| Boundary | Observed result | Integration consequence |
| --- | --- | --- |
| Model discovery | `agy models` returned 14 tab-separated ID/name rows, including Gemini and non-Gemini models | Discover the catalog; do not hardcode Gemini 2.5 or infer provider identity from a model brand |
| Two turns in one process | One `init`, streamed `step_update`, two `SUCCESS` results; second turn recalled a synthetic marker | Sequential chat is viable; send the next prompt after `result` |
| Resume in a new process | Explicit `--conversation` retained the ID and recalled the marker | Provider context resume works; never use workspace-global `--continue` for agent routing |
| Resume output | Only new steps streamed, not the earlier user/assistant transcript | Resume is not transcript hydration |
| Approval/control input | `control_request` produced `ERROR`, exit 2, before a model turn | Do not implement approval replies or cancellation as invented stdin controls |
| Image input block | `image` block rejected explicitly as non-text, exit 1 | Native multimodal stream input is unavailable in this version |
| CLI slash input | `/model` returned `ERROR`, exit 2 | Use catalog/launch options, not TUI commands sent as prompts |
| Harmless command permission | `run_command` for `/usr/bin/printf PHASE0_COMMAND_OK` was denied; result was `SUCCESS`, empty response, `denied_actions: [{action: "command", display_name: "RunCommand"}]`, exit 0 | Check denied actions and tool errors independently of process/result success; never silently broaden permissions |
| Workspace MCP discovery | Scratch `.agents/mcp_config.json` launched the dummy stdio server; an independent loopback recorder observed `initialize`, `notifications/initialized`, and `tools/list` | Workspace configuration and tool discovery work; this is not per-agent identity isolation |
| Workspace MCP permission | Read-only local probe tool attempt produced `denied_actions` for `mcp`, empty response, `SUCCESS`, exit 0; recorder saw no `tools/call` | Default headless mode cannot complete a permission-gated MCP call; no successful Korus collaboration is claimed |
| Active-turn cancellation | SIGINT on first streamed text returned `status: "ERROR"`, `error: "interrupted"`, exit 1 | Track the host's targeted cancellation intent; do not rely exclusively on a native `INTERRUPTED` status |
| Resume after cancellation | Fresh process with the interrupted ID returned `RECOVERED_PHASE0` successfully | Text-generation cancellation is recoverable; subprocess/tool cancellation remains untested |
| Plan launch | `--mode plan` accepted; a two-step plan streamed as ordinary `agent_response` text without tools or file writes | Launch mode exists; structured proposed-plan events, edit prohibition, approval, and switching back remain unproven |
| Reasoning | Tool/cancellation runs counted thinking tokens, but captured stream records had no thought-text payload | Do not promise reasoning cards based on usage counters |

Local smoke identifiers for tracing (not production defaults):

- Sequential chat/resume: `fe3f457c-d4de-4227-8d85-4b2dfd520dd1`.
- Command denial: `7fb4ce3b-bf4e-44fd-8e7e-52d4d69488c7`.
- Plan: `ca8a740b-cc4b-4064-8c08-e63425bf2e3f`.
- Interrupt/recovery: `167de5e5-45e3-4cac-88e9-ae52290e5ba3`.
- Independently observed MCP discovery/denial: `d61bcdb2-7d90-4b9c-bdac-6687d8c808ab`.

### Protocol details the adapter must preserve

Measured launch:

```sh
agy --input-format stream-json --output-format stream-json \
  --model gemini-3.8-flash-low --print-timeout 30s
```

Each input is one JSON line, for example:

```json
{"event":"user","message":{"content":"Remember marker KORUS_PHASE0_7H4Q. Reply with the marker only; do not use tools."}}
```

Read stdout while stdin stays open. Wait for `result`, then send a recall prompt.
After the second result, close stdin; relaunch with `--conversation <id>` to
check recall across processes. Use only a fresh scratch workspace and harmless
prompts. The temporary `probe.mjs` used for this investigation is not a maintained
repository test or a prerequisite for implementation.

- `init.conversation_id` is **not** the observed shape: the ID is top-level
  `conversation_id`, alongside `init` containing model, cwd, tools, permissions.
- Step identity is `(conversation_id, step_index)`; updates have state/type,
  optional `text_delta`, and optional `tool_info`. The same step can receive
  multiple active deltas and a final update. Do not append a duplicate message
  from `result.response` after already rendering its streamed text.
- Result usage and `num_turns` remained cumulative across process resume
  (1, 2, then 3). They are not per-turn counters. Duration also spans more than
  the current prompt; do not use it as a current-turn wall-clock measurement.
- Denied MCP activity can have a `DONE` tool step yet a result-level denial.
  Normalize denied actions explicitly so an empty completion cannot hide them.
- CLI help advertises `--mode accept-edits|plan` and effort
  `low|medium|high|xhigh|max`. The web headless guide lists fewer effort levels
  and a different default timeout. Verify supported model/effort combinations;
  help text alone does not prove every combination works.

### CLI-only gates and decision

1. **Approval capability:** interactive approval callbacks are unavailable over
   the tested CLI protocol. A constrained CLI integration must advertise
   `approvals: false` and surface policy denials. Do not default to dangerous
   bypass or fake an approval dialog that cannot answer the runtime.
2. **MCP identity/config isolation:** documented workspace/global configuration
   is not safe for persisting per-agent credentials or identities when multiple
   Korus agents share a folder. Prove a per-process configuration mechanism, a
   supported private home, or a stable proxy whose caller identity is supplied
   through a verified per-process channel. A local dummy-server probe is not proof of two-agent
   identity isolation or a successful authenticated Korus MCP call.
3. **History hydration:** the probe conversation has a native `.db` file, but no
   supported machine-readable history API was established. Do not assume its
   private storage format is a public contract or silently introduce an app-global
   transcript store. Resolve restart/history ownership before rollout.
4. **Plans, goals, and steering:** keep native goals and steering disabled until
   an actual supported contract is demonstrated. Plan launch alone is not the
   full Korus plan artifact/review lifecycle. Text-only files as context would
   also need an explicit secure adapter; native image blocks are rejected.
5. **Auth and process lifecycle:** prove first-run/disconnected handling,
   credential expiry, process failure, tool-child cancellation, and concurrent
   agent isolation before enabling the provider broadly.

**CLI decision:** do not implement the original full-parity CLI design. Text chat
is feasible, but its approval gap is real. The source comparison below supersedes
CLI as the preferred transport candidate; ACP must receive its own live probes.
The Python SDK is an alternative to evaluate, not an approved replacement: it
documents approval callbacks and storage configuration, but its documented
authentication is API-key/Vertex-based rather than proven CLI subscription reuse.

### Primary sources (checked 2026-10-05)

- [Headless protocol](https://antigravity.google/docs/cli/headless/): sequential
  text input, stream events, unsupported controls, resume, permission denials.
- [CLI reference](https://antigravity.google/docs/cli/reference): interactive
  commands and settings; TUI behavior is not automatically a headless API.
- [Installation/auth](https://antigravity.google/docs/cli/install/),
  [installer](https://antigravity.google/cli/install.sh), and
  [darwin/arm64 manifest](https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests/darwin_arm64.json):
  native runtime provenance and auth flow. The fetched installer itself supports
  `--dir`; do not assume flags listed on the website match that script.
- [CLI configuration](https://antigravity.google/docs/cli/using/): settings under
  `~/.gemini/antigravity-cli/settings.json`, distinct from desktop-app data.
- [MCP](https://antigravity.google/docs/mcp/): `.agents/mcp_config.json` and
  `~/.gemini/config/mcp_config.json`, `mcpServers`, `serverUrl`/headers or stdio.
- [Resume](https://antigravity.google/docs/cli/commands/resume/): conversation
  selection/cache; not a documented transcript export API.
- [Skills migration](https://www.antigravity.google/docs/cli/gcli-migration/):
  `.agents/skills/` and `~/.gemini/antigravity-cli/skills/`.
- [Plan](https://antigravity.google/docs/plan/): interactive planning/artifacts.
- [Python SDK](https://antigravity.google/docs/sdk/overview/),
  [policies](https://antigravity.google/docs/sdk/policies/), and
  [lifecycle](https://antigravity.google/docs/sdk/lifecycle/): alternative
  embedding contracts; not exercised in this phase.

## T3 and Synara code comparison (2026-10-05)

This is source evidence, not a new live-provider qualification. Neither app was
started, neither repository was edited, and their test suites were not run.
Checked remote `main` identities without moving either local checkout:

- T3: `54b6b667f340c03132e9fc2cb2c3d657571442a2`. Its local checkout was older
  (`4ee6bfd5`); key files were fetched at the current remote commit.
- Synara: `a83a6248b1f66541d7233f206ce450f72f80da5f`. Its local checkout was
  `cb760d5b`; the current Antigravity adapter and MCP injection source were
  fetched and matched the inspected local files byte-for-byte.

### T3: official ACP runtime, not CLI stream-json

T3's Antigravity driver uses Google's separately distributed ACP runtime. Current
source pins 1.3.0. This is not the Python SDK/API-key alternative discussed above;
its default authentication method is `oauth-personal`. Google's
[Zed integration documentation](https://antigravity.google/docs/ide/extensions/zed/)
also documents personal Google-account authentication, and the
[official ACP registry entry](https://github.com/agentclientprotocol/registry/blob/dc55a34900fdd60e5e97c1cbd7825c5a1df673fc/antigravity-acp/agent.json)
identifies Google as author and supplies Google-hosted binaries.

| Concern | T3 mechanism | Consequence for Korus |
| --- | --- | --- |
| Approvals | ACP `session/request_permission`; Antigravity permission mapping supports default, auto-edit and yolo. Client filesystem callbacks enable file-content approval flows | Native approval integration is a credible ACP path; the CLI limitation is not provider-wide |
| MCP | Session-scoped `mcpServers`; a stdio-to-HTTP bridge receives session endpoint/authorization through its environment | Do not write caller identities into shared workspace/global MCP config |
| Profile isolation | `GEMINI_HOME` points to a managed provider-instance profile; `AGY_ACP_FORCE_FILE_STORAGE=1`; runtime temp directories are separately owned | Concrete isolation mechanism to validate; do not assume CLI shares these runtime semantics |
| Resume/history | Antigravity explicitly prefers `session/resume` without replay; T3 retains its own UI transcript. Generic ACP code also has a capability-gated `session/load` snapshot path | Resume does not remove Korus's hydration obligation; investigate native replay separately before choosing persistence |
| Cancellation | `session/cancel`, wait for active prompt settlement, bounded timeout with process shutdown | Prefer native cancellation with terminal-event ownership and a process fallback |

Exact T3 sources, pinned to the inspected remote revision:

- [Runtime release/provenance](https://github.com/pingdotgg/t3code/blob/54b6b667f340c03132e9fc2cb2c3d657571442a2/apps/server/src/provider/antigravityRelease.ts).
- [ACP flavor and permission mode](https://github.com/pingdotgg/t3code/blob/54b6b667f340c03132e9fc2cb2c3d657571442a2/apps/server/src/provider/acp/AntigravityAcpSupport.ts#L43).
- [Private profile environment](https://github.com/pingdotgg/t3code/blob/54b6b667f340c03132e9fc2cb2c3d657571442a2/apps/server/src/provider/antigravityAuthSupport.ts#L220).
- [Antigravity resume and file callbacks](https://github.com/pingdotgg/t3code/blob/54b6b667f340c03132e9fc2cb2c3d657571442a2/apps/server/src/orchestration-v2/Adapters/AntigravityAdapterV2.ts#L166).
- [Shared ACP orchestration and MCP injection](https://github.com/pingdotgg/t3code/blob/54b6b667f340c03132e9fc2cb2c3d657571442a2/apps/server/src/orchestration-v2/Adapters/AcpAdapterV2.ts).
- [ACP request and cancellation lifecycle](https://github.com/pingdotgg/t3code/blob/54b6b667f340c03132e9fc2cb2c3d657571442a2/apps/server/src/provider/acp/AcpSessionRuntime.ts).
- [Durable UI message projections](https://github.com/pingdotgg/t3code/blob/54b6b667f340c03132e9fc2cb2c3d657571442a2/apps/server/src/orchestration-v2/ProjectionStore.ts#L2234)
  and [capability-gated history snapshot loading](https://github.com/pingdotgg/t3code/blob/54b6b667f340c03132e9fc2cb2c3d657571442a2/apps/server/src/orchestration-v2/Adapters/AcpAdapterV2.ts#L7755).

Existing tests cover native approval choices and filesystem confinement in the
Antigravity adapter, plus MCP setup and cancellation draining in the shared ACP
adapter. They were inspected as source evidence, not executed here:
[Antigravity tests](https://github.com/pingdotgg/t3code/blob/54b6b667f340c03132e9fc2cb2c3d657571442a2/apps/server/src/orchestration-v2/Adapters/AntigravityAdapterV2.test.ts#L74),
[ACP tests](https://github.com/pingdotgg/t3code/blob/54b6b667f340c03132e9fc2cb2c3d657571442a2/apps/server/src/orchestration-v2/Adapters/AcpAdapterV2.test.ts#L3482).

### Synara: CLI workaround with explicit tradeoffs

Synara uses `agy -p` per turn, with explicit conversation resume. It rejects
non-full-access sessions and passes `--dangerously-skip-permissions`; request
responses are unsupported. It does **not** solve native CLI interactive approvals.

It installs a user-global capture plugin under the Antigravity CLI home. Hooks
capture lifecycle/tool events to a per-run file, and the adapter tails
`brain/<conversation-id>/.system_generated/logs/transcript.jsonl`, including
thinking/tool records absent from the minimal stdout stream. This is a richer
CLI integration, but introduces plugin lifecycle and native-transcript coupling.
Cold adapter startup initializes an empty in-memory turn list, and subsequent
dispatch skips already-existing transcript bytes; that alone is not full history
hydration. Synara also maintains app-owned persisted message projections.

Its MCP configuration contains no session bearer: a stable stdio proxy receives
the endpoint and a one-shot bootstrap value from each process, exchanges that
value for a session credential, and keeps the bearer in memory. This directly
addresses the same-folder identity problem without per-agent config rewrites.
Cancellation combines gateway cancellation, owned process-tree teardown and
idempotent turn settlement, including a fallback when no process remains.

Sources:

- [Approval rejection](https://github.com/Emanuele-web04/synara/blob/a83a6248b1f66541d7233f206ce450f72f80da5f/apps/server/src/provider/Layers/AntigravityAdapter.ts#L2237),
  [launch flags](https://github.com/Emanuele-web04/synara/blob/a83a6248b1f66541d7233f206ce450f72f80da5f/apps/server/src/provider/Layers/AntigravityAdapter.ts#L2499),
  [capture plugin](https://github.com/Emanuele-web04/synara/blob/a83a6248b1f66541d7233f206ce450f72f80da5f/apps/server/src/provider/Layers/AntigravityAdapter.ts#L518),
  [skip prior transcript](https://github.com/Emanuele-web04/synara/blob/a83a6248b1f66541d7233f206ce450f72f80da5f/apps/server/src/provider/Layers/AntigravityAdapter.ts#L1760),
  [cancellation](https://github.com/Emanuele-web04/synara/blob/a83a6248b1f66541d7233f206ce450f72f80da5f/apps/server/src/provider/Layers/AntigravityAdapter.ts#L2690).
- [Secret-free plugin / per-process MCP bridge](https://github.com/Emanuele-web04/synara/blob/a83a6248b1f66541d7233f206ce450f72f80da5f/apps/server/src/agentGateway/mcpInjection.ts#L217).
- [Persisted message projections (local inspected revision)](https://github.com/Emanuele-web04/synara/blob/cb760d5b5eace10c3e823feb8dc5a39748f0c67e/apps/server/src/persistence/Layers/ProjectionThreadMessages.ts#L36).

### Transport decision

Use the T3-style **official ACP integration**, not Synara's mandatory-full-access
CLI path. Source inspection identified the protocol; the live probes below
establish its main behavior. Do not copy either app's transcript architecture.

Treat replayed tool records as history, not instructions to re-execute effects.
Keep all normalization and any agreed durable cache inside the Antigravity host;
preserve the Codex SDK boundary.

## Phase 0: live ACP evidence (2026-10-05)

### Runtime, authentication and scope

- Downloaded Google's darwin/arm64 ACP **1.3.0**, matching the current T3 pin,
  into `/tmp/korus-acp-phase0.uKZcYN/runtime`. Verified registry SHA-256
  `7cd97045f7b4fe81175a107cdf16f9c51484e3c78a5162cae415338bb6aa5b88`.
  Launched `agy_acp_server.par` with its matching `localharness_external`;
  no global installation, API key or custom agent loop.
- Fresh `GEMINI_HOME`, `AGY_ACP_FORCE_FILE_STORAGE=1`, private runtime temp
  directory, and ambient Google API-key/project credentials removed from child
  environment. Nicolas completed native personal OAuth in the browser. A later
  process returned `{}` from `authenticate` without another login.
- ACP resolved settings, native credential storage and conversations under the
  private profile. **Not a full filesystem sandbox:** the harness also logged an
  embedded `webm_encoder` install/update under `~/.gemini/antigravity/bin`.
  Do not claim that `GEMINI_HOME` confines every auxiliary runtime write.
- Only scratch files and read-only dummy MCP tools were used. Permission mode
  stayed `default`; responses selected native `allow_once` / `reject_once`,
  never yolo or allow-always. File callbacks restricted paths to the scratch
  workspace. No Korus app restart or production MCP identity was involved.
- Bounded Node probes live in that temporary directory (`probe.mjs`, `live.mjs`,
  `mcp.mjs`). They are investigation artifacts, not maintained regression tests.

### Observed contracts

| Boundary | Live result | Implementation consequence |
| --- | --- | --- |
| Initialization | Version 1.3.0 reports numeric protocol 2 but `agentInfo` / `agentCapabilities`, the v1 wire shape | Negotiate using response shape as T3 does; do not switch to `auth/login` based on the integer alone |
| Login | Fresh-profile OAuth completed; session creation and subsequent authenticated prompts succeeded | Native personal-account auth works independently of CLI login; keep tokens provider-owned |
| Model/mode discovery | 11 native model choices; `default`, `auto_edit`, `yolo` modes; model IDs encode effort; `plan` and `logout` commands advertised | Use the ACP catalog, not the CLI's different 14-model list; advertised commands are not proof of full feature behavior |
| Fresh chat | Streamed `ACP_RECALL_58QH`; prompt settled with `stopReason: end_turn` | Native text streaming and terminal prompt response both matter |
| Cold resume | New process, same native session, no history chunks; next prompt recalled the marker | `session/resume` restores model context without rendering old messages |
| Cold load | Another new process replayed both user prompts and assistant replies through `session/update` | Use supported `session/load` for initial hydration; no private database parsing is required for the measured history |
| File allow | `session/request_permission` supplied path, diff and native choices; allow produced `fs/write_text_file`, completed tool and exact `FILE_ALLOW` bytes on disk | Approval UI can show the actual edit, then answer the native request |
| File deny | Same native approval path with reject; no write callback and no target file; model returned `denied` | Rejection actually prevents this edit, not merely changes UI status |
| Command allow/deny | Same harmless `/usr/bin/printf ACP_COMMAND_OK` requested twice; native allow yielded completed tool and output; native deny yielded failed tool and `denied` | Preserve execute approvals and final tool failure even when prompt ends normally |
| MCP session scoping | Resumed A and fresh B shared cwd and server name but separate env sentinels; dummy servers independently recorded `tools/call`; returned A/B identities matched; repeated with both prompts outstanding concurrently | Supply each session's bridge environment in `mcpServers`; no shared workspace configuration rewrite |
| Cancel/recover | Notification `session/cancel` during streamed text settled the original prompt with `stopReason: cancelled`; next prompt in the same process returned `ACP_RECOVERED` | Await cancelled prompt settlement before accepting another turn; retain bounded process fallback |
| Cold history after tools | 33 replay updates included user/assistant text, successful/denied edits, commands and MCP; no permission/file callbacks and no extra MCP invocation | Hydrate from native replay without re-executing effects |

**Replay caveat:** live tool IDs (hex IDs) changed to `call_<number>` on cold
load. A denied tool was initially replayed as a completed `tool_call`, followed
by a failed `tool_call_update`. Build a fresh provider replica from ordered replay,
apply subsequent status updates, and atomically replace the prior snapshot. Do
not merge live and replayed tools by ID, freeze the first terminal-looking record,
or let historical failures change the current turn's running state. Real-provider
captures demonstrate why the adapter needs meaningful replay regression fixtures.

Primary native conversation: `b555f636-5f80-478f-bcea-da8c5bd6fb53`.
Second MCP conversation: `f658ffbb-8b58-46bf-97ff-67a583d568f2`.
Local JSONL logs preserve protocol evidence without credential contents; native
credentials remain in the private profile and must never enter repository fixtures.
Independent assertions over ten logged ACP runs passed: no recorded RPC errors,
exact allowed-file bytes, denied-file absence, recalled marker, cancelled-then-normal
prompt settlement, four actual MCP calls split equally across A/B, and 33 cold
replay updates without host requests. The allowed file's modification time stayed
unchanged through replay. No probe/runtime/helper processes remained afterward.

### Qualification boundary

The former CLI blockers no longer block starting the ACP provider implementation.
Implement text chat, discovered models/modes, native permissions, isolated MCP,
load/resume and cancellation behind the provider host. The extended assessment
below resolves the remaining capability questions: support measured attachments,
skills and adapted planning; disable absent native goal/steer/fork/turn-mutation
controls. Production gates still include auth expiry/relogin, crashed runtime
and tool-child cleanup, long-history replay fidelity, real Korus MCP authentication
and mounted conversation/approval UI. These are implementation acceptance gates,
not reasons to defer selecting the transport.

## Completed capability assessment: ACP 1.3.0

The following replaces the earlier "not qualified" comparison. **Available**
means the native runtime provides the behavior, not that Korus has implemented
its adapter. **Absent** is scoped to this shipped ACP runtime, not all Google
Antigravity products. App-owned workflows remain integration work, not unknown
native capabilities.

| Capability | Conclusion | Evidence / adapter requirement |
| --- | --- | --- |
| Text, tools, approvals, history, resume, cancellation | Available | Initial live qualification above |
| Model and effort selection | Available as model configuration | `session/set_config_option` changed model to `gemini-3.8-flash-low`; next prompt completed. Effort is encoded in model IDs, not an independent numeric thinking budget |
| Permission mode selection | Available | `session/set_mode` accepted `auto_edit`, then `default`; no yolo execution used |
| Image attachments | Available | Direct PNG block correctly identified red left half and blue right half; prompt requested no tools and no tool requests occurred |
| Audio attachments | Available | Direct WAV block transcribed the synthetic English sentence exactly. An earlier default-voice fixture was poorly transcribed; format acceptance is not a transcription-quality guarantee |
| Text/source attachments | Available | Embedded text resource returned its exact hidden marker without file/tool access |
| PDF attachments | Available via trusted local resource links; embedded PDF blobs unsupported | `resource_link` returned the PDF's exact marker. Identical document as embedded blob was ignored and model reported no attachment; parser only handles image/audio blobs |
| Skills | Available | Model discovered and read `.agents/skills/phase0-evidence/SKILL.md`, returning its marker (not supplied in prompt or skill description) |
| Planning | Native `/plan` primitive; Korus artifact UI needs adaptation | Shipped parser converts `/plan` into a native `SlashCommand`; live probe wrote `PLAN.md`, requested native approval, acknowledged the selected choice and stopped without implementation. Output is ordinary text/file tools, not structured ACP `plan` events |
| Questions / choices | Available | Planning emitted `session/request_permission` with `interaction_*` ID, question title and two native option IDs; selected approval was acknowledged. Distinguish this from a tool-permission request |
| Goals | Absent | No goal API or configuration; main agent behavior is `INTERACTIVE`; `/goal` is ordinary model text. A marker response to it does not establish a goal lifecycle |
| Active steering | Absent; concurrent same-session prompt unsafe | Live overlapping prompts produced a native `Concurrent receive_steps()` error and still `end_turn` replies. Serialize turns. An explicit cancel-then-send action is possible using the proven cancellation path, not native steering |
| Native conversation fork | Absent | Not advertised; live `session/fork` returned `{}` without a child ID. Shipped adapter inherits an empty base stub; this is not successful forking |
| Edit/retry/delete historical turns | Absent | No implementation in the shipped adapter; attempted mutation RPCs returned method-not-found. Do not rewrite provider databases to fabricate support |
| Manual context compaction | Absent as a native control | `/compact` generated ordinary summary text and retained the marker; parser has no compact command and adapter has no compact RPC/event. Internal automatic compaction exists in SDK source but is not a manual-control contract |
| Context usage | Available | Live `usage_update` carries used tokens and context size; do not equate this with subscription quota or billing |
| Reviews and fix rounds | Required native mechanics available; Korus integration absent | Live model reported a finding through dummy MCP `report_finding`, confirmed `findingCount: 1`, wrote corrected source, read it back, then confirmed `findingCount: 0`. Independent server ledger and disk bytes verified; not a run of Korus `CodeReviewService` |
| Missions, delegation, automations | Korus-owned integration, not native ACP features | Proven session-scoped MCP, independent sessions, turn completion and approvals supply the required transport. Existing backend unions still accept only Codex/Claude; these product flows cannot run with Antigravity until implemented |
| Plugin catalog, remote-control pairing, service tiers, explicit thinking budget, subscription quota | No corresponding exposed ACP adapter interface | Do not inherit CLI/IDE capabilities or expose Codex-specific controls. Native model/skill discovery and context usage remain separate |
| Archive / replace with summary | No native archival or replacement operation | Korus could retain/archive its own references or create an explicit new session from a summary; that would be product behavior, not a provider-native mutation |
| Authentication renewal | Native-owned implementation | Shipped credential manager checks validity and silently refreshes before falling back to interactive login. Live login and cached reuse passed; expiry was source-audited, not induced by editing credentials |

### Evidence and important negative controls

- Additional runs are recorded in `/tmp/korus-acp-phase0.uKZcYN/assess-*.jsonl`.
  Inputs are generated synthetic media/text and disposable workspace files. No
  personal attachment or production account data was sent as prompt context.
- The initial long planning probe exposed a **probe-client** bug: inbound server
  request IDs can equal outstanding client request IDs. Dispatch must distinguish
  requests by `method` before matching responses. Fixed the scratch probe and
  reran planning; discarded the prematurely settled run. Protect this bidirectional
  RPC contract in the production adapter's tests.
- T3's `supportsCompaction` is not proof: its ACP adapter sends `/compact` text
  and can synthesize a compaction-completed item after a normal end-turn. The
  actual Antigravity parser only recognizes native `/plan` (plus separate logout
  handling). Do not copy that false-positive completion inference.
- A normal end-turn response is likewise not enough to classify overlapping
  prompts as supported steering. The live stream contained an explicit connection
  error even though both prompt calls eventually returned end-turn.
- PDF resource links read files on the provider host. Korus resolves trusted
  local desktop references through its registry. Implementation audit found no
  existing remote transfer or Web upload/registry seam: the earlier plan overstated
  that boundary. Per delegating-agent direction, those attachments stay unavailable
  and are rejected before dispatch. A general transfer system is a separate follow-up;
  never accept arbitrary renderer paths or assume a Mac URL exists remotely.
- Independent assertions passed for exact image/audio/text/PDF/skill fixture
  results, PDF-blob rejection, absent-method responses, the concurrent-prompt
  failure, ordered review-tool ledger counts (1 then 0), executable corrected
  addition, persisted plan and native approval without source implementation.
  All probe/runtime processes terminated. Repository changes remain docs-only;
  no application suite was run because no production code changed.

### First-party implementation provenance

The checksum-pinned official executable contains uncompressed Python source in
local ZIP records, although `unzip` cannot find a central directory. The read-only
`embedded.mjs` scratch inspector scans ZIP header bytes `50 4b 03 04`, validates the
stored-entry method, filename and length, and reads source bytes without running
them. This is shipped source inspection, not behavior inferred from generic ACP
schema or invented method names.

Under `google3/cloud/developer_experience/antigravity_extensions/acp_server/`:

- `server.py:1161–1179,1237–1360`: command parsing and attachment conversion.
- `server.py:1561` and bundled `google3/third_party/py/acp/interfaces.py:291–302`:
  adapter inheritance and empty fork stub.
- `server.py:4093–4099,4879–4995`: interactive agent behavior and question choices.
- `oauth/credential_manager.py:493–539,570–608`: reuse, refresh and login fallback.
- Bundled `google/antigravity/types.py` defines only `PLAN` in
  `BuiltinSlashCommandName`; `conversation/conversation.py:94–122` waits/drains
  previous work rather than providing a steering operation.

Public cross-checks: [ACP content contracts](https://agentclientprotocol.com/protocol/v1/content),
[Google ACP authentication](https://antigravity.google/docs/ide/extensions/zed/),
and [Google skills](https://antigravity.google/docs/skills/). The shipped ACP
implementation and live probes take precedence over documentation for a different
Antigravity surface.

## Current-code integration map

| Concern | Current owner and required work |
| --- | --- |
| Backend identity | Extend `core/src/contracts/shared.ts` (`AgentBackend`) and `core/src/backend-driver.ts` (display name/driver contract as needed) |
| Sessions/defaults/capabilities | Provider branches live in `core/src/contracts/backend.ts`, not `shared.ts`; use explicit unsupported capabilities |
| Authentication | Extend `contracts/provider-setup.ts` and its runtime validators; installation, authentication, enablement, and runtime health remain separate |
| Settings and persistence | Reuse `providerEnabled`/`providerHomes`; update `core/src/settings.ts`, snapshot guards, model/permission preferences, and snapshot/session decoders. No `antigravityEnabled` flag |
| Availability | `core/src/agent-backends.ts` already filters live `providerConnections`; preserve explicit-provider failure and host-local availability |
| Factory/lifecycle | Register in `backend/src/driver-rpc.ts` and `provider-lifecycle.ts`; use `resolveRuntimeExecutable`/`withDiscoveredRuntimePath`, not ad hoc PATH scans |
| Authentication recovery | Reuse `ProviderConnections.observe`, credential-free `provider.authenticationChanged`, and disconnected-provider re-probing at new-work admission; never persist a login observation as enablement |
| Conversation ownership | Antigravity host + provider-specific snapshot/events/replica; route via `core/src/contracts/events.ts` and app-owned transport envelopes, without copying the entire Claude reducer by default |
| Selection UI | `BackendSelector.vue` already consumes dynamic choices; preserve dialog markup where sufficient. Update `backend-selection.ts` persisted-choice validation and remaining two-provider assumptions |
| Conversation UI | Add icon, provider snapshot binding, identity, requests and capability projections in the existing app-state/provider host path and `use-agent-conversation.ts`; a null-coalescing snapshot addition alone is insufficient |
| Settings UI | Extend settings navigation/panel using `SettingsEngineConnectionRow`, backend display names, and i18n |
| Workflows | Audit `core/src/code-review.ts`, MCP backend validators, automations, Mission roles, remote-host routing and fresh-agent switching. Generic selectors do not prove these contracts accept a third provider |
| MCP namespace | Use `product.mcpServerName` (`korus`) for configuration and instructions, shared with Codex and Claude. Do not introduce a provider-specific namespace |

## Remaining implementation phases

### Phase 1: contracts and lifecycle

Implementation complete for review (2026-10-06): added Antigravity identity/session/default
contracts, persisted generic preferences and disk schema, with creation/switch and
disk-roundtrip regressions. Unavailable driver creation fails explicitly; default
capabilities and commands do not inherit Codex features. Lifecycle registration,
native authentication and all applicable admission paths are implemented.

Validation so far: all five workspace tests plus script tests passed after refreshing
the installed SDK build; affected contract/persistence tests and typechecks passed.
This is foundation work, not shipped Antigravity support.

Lifecycle foundation added: version-pinned paired-runtime discovery/installation,
private home and native skills links, sanitized process environment, and provider-owned
OAuth checks. Native fresh-profile probing confirmed background authentication
detects a missing login without opening a browser. Credentials remain exclusively
owned by Google's runtime. Login expiry was not induced.
The actual installer downloaded and checksum-verified the paired macOS ARM64
archive into a fresh temporary APP_HOME; that installation initialized as ACP
1.3.0/protocol 2. Authentication cancellation during startup and disconnected
Settings retry now have regression coverage without changing enablement.

- [x] Qualify ACP for the measured text/permissions/MCP/history/cancellation scope.
- [x] Extend backend/session/default/auth unions and all owning runtime decoders.
- [x] Extend generic settings normalization, connected choices, and remembered
  selections without silently falling back from an explicitly selected provider.
- [x] Register discovery, installation, configured home, and connection observation.
- [x] Add contract tests for roundtrip persistence, unavailable-provider rejection,
  disconnected retry, and cross-provider default isolation in this same milestone.

### Phase 2: selected transport and a minimal conversation slice

Transport implemented: duplex JSONL framing handles colliding inbound
request IDs, split frames, bounded buffers, EOF and request timeouts. Deterministic
tests launch a real child process that supplies sanitized ACP shapes. A fresh-home
initialization using the qualified native runtime reported protocol 2, version 1.3.0
and loadSession support. The provider host now streams its own revisioned replica,
handles native approvals/questions and cancellation, and atomically rebuilds history.
Native prompt completion and cold replay passed using the qualified runtime and
the existing probe login in place. Full workspace tests/typechecks passed. Scoped
MCP bridge tests prove two child environments stay separate. Actual review/Mission
services now have workflow tests with only the external provider boundary faked.

- [x] Spawn the qualified ACP runtime without a shell; implement request/response,
  notification framing, bounded buffering, session routing and process cleanup.
- [x] Implement proven prompt/resume/load semantics, permission responses and
  native cancellation with bounded teardown fallback.
- [x] Surface tool denials, protocol errors and unexpected exit. CLI-specific
  `denied_actions` handling applies only if a CLI fallback is explicitly chosen.
- [x] Add transport-boundary tests with captured sanitized protocol shapes;
  test success, denial, split lines, EOF, interruption and stale completion races.

### Phase 3: provider host, history and collaboration

History now validates native catalog session/cwd identity before replay, including
canonical paths, and exposes folder-scoped listing and cross-provider history reads.
Real CodeReviewService and scoped HTTP MCP tests run through the actual stdio bridge
with an external ACP fixture: one finding, remediation with evidence, clean second
round, and disposal. Two regular bridges update only their own same-repository agents.
Mission workflow tests exercise worker reuse, stage acceptance and restored evidence;
Antigravity does not receive a synthetic `/compact` between tickets. Automation and
worktree delegation tests retain the selected provider and isolated session.
Native-runtime review/MCP proof is still pending; the fixture tests are not live model proof.

- [x] Implement the provider-owned host/replica and bounded revisioned transport.
- [x] Hydrate through native `session/load`, rebuild the provider replica atomically
  despite changed replay tool IDs, and validate session identity; prove reload
  does not lose or duplicate streamed messages or re-execute tools.
- [x] Add safely scoped MCP configuration and normal/review-session tool discovery.
- [ ] Verify two agents sharing a workspace retain separate MCP identities and
  sessions; test reconnection and credential/config cleanup at the owning seam.
- [x] Enable reviews/Missions only after their required MCP and lifecycle
  contracts work, including review round completion and session disposal.

### Phase 4: UI and capability hardening

Settings/onboarding/navigation, icon, native authentication actions, provider
replica binding and model selection are implemented with mounted tests. The
isolated branch Web client/daemon loaded the native model catalog and connected
account state. Trusted desktop attachments now map to native images, WAV,
embedded text and PDF resource links. Web and remote attachments reject before
dispatch because those clients do not yet have trusted ingestion/transfer.
Provider-owned prompt metadata preserves the original prompt and attachment
chips during cold native replay without storing a second transcript.

Native `/plan` now feeds Korus's existing preview/confirmation flow. Mounted
confirmation and daemon acceptance tests cover the transition to a separate
implementation turn. Live host probes read synthetic image/WAV/PDF/text inputs;
an approved PLAN.md write exactly matched the preview and left the source file
unchanged. A denied plan write surfaced honestly. Full typechecks/lint and all
five unchanged statement coverage gates passed (core 85.69%, backend 86.83%,
Vue 87.71%, Electron 85.04%, Web 95.93%). Native collaboration verification
remains pending; the branch Web flow is documented in the checkpoint below.

- [x] Add backend icon, settings panel/navigation/i18n, conversation binding and
  model/effort options; reuse creation dialogs and shared controls.
- [x] Map the assessed capability matrix explicitly: native goals, steering,
  forks and historical turn mutations stay disabled; enable measured attachments,
  approvals and adapted planning. Test the Korus plan preview/confirmation flow
  against native artifact writes and question choices before advertising it.
- [x] Mount representative selection, Settings, permission-denial and restart
  flows. Verify persisted choices and unsupported-control behavior through UI.
- [x] Exercise the actual provider boundary and one desktop/Web consumer flow.

### Review checkpoint and remaining native proof (2026-10-06)

The delegating agent approved review readiness with the following explicit live
limitation, not merge/publication or a claim of fully live-validated support.
Native two-agent **Korus** MCP identity and native **CodeReviewService** remediation
remain outstanding. Initial probes denied native MCP permission requests; corrected
probes reached Google's usage limit (the runtime reported a reset in 3 days,
5 hours). Both default Gemini 3.8 Flash and catalog-selected Gemini 3.1 Pro Low
returned the limit message. No account change, token extraction or alternate
transport was used. The review correctly paused without an accepted
`finish_review_round`; no clean-review result was inferred from assistant text.

Native cancellation through our session produced `interrupted`, followed by a
completed quota-message turn in the same still-open process. This proves recovery
of the protocol, not successful model work after cancellation. A separate branch
Web session did return `WEB_NATIVE_PROOF`; its original user prompt and one
assistant reply survived reload. Submission used the public WebSocket operation;
the real browser DOM verified rendering. Restarting only the owned preview
daemon proved cold native history hydration with no duplicate/lost messages.
ACP supplies no original replay timestamps; these now remain absent instead of
showing the reload time. The browser typing tool does
not support the contenteditable composer and screenshot capture timed out, so
neither physical typing nor screenshot verification is claimed. Settings showed
the native account/catalog and rejected disabling the last available engine.
An actual Web attachment request failed before dispatch with the trusted-upload
explanation.

Final automated gates: `npm run test:ai` passed all five workspaces (3,368
Vitest tests) and 15 script tests. `npm run lint` passed architecture, all
workspace typechecks, CSS, i18n and dead-code checks. `npm run test:coverage`
passed every unchanged 85% statement gate; backend coverage was rerun after
the final auth/replay fixes. Final statements: core **85.69%**, backend
**87.08%**, Vue **87.71%**, Electron **85.04%**, Web **95.93%**. The branch Web
build and final backend build passed. No signed package/release was attempted.

The user's native-picker screenshot includes GPT-OSS 120B (Medium). A source audit
of the **qualified runtime** explains why Korus does not: `acp_server/model_selection.py`
allows third-party models only for client identities JetBrains, Zed and Xcode,
then removes non-`gemini` IDs for everyone else. `client_info.py` has no general
capability opt-in. Korus does not impersonate an editor or hardcode unavailable
models. Its catalog pass-through test includes a synthetic GPT-OSS entry to
ensure it will display one when the native contract supplies it. This requires
an upstream-supported change before GPT-OSS can be advertised for Korus.

Rerun the two native collaboration checks after quota permits work:

1. Keep this worktree checked out and use an isolated scratch repository and
   APP_HOME. Revalidate paired ACP 1.3.0/protocol 2; use the user's native login
   in place or request a fresh native login. Never copy/read credential files.
2. Bundle the production `AntigravityHost`, `AcpSession`, `AppMcpService`,
   `CodeReviewService`, `AgentCreationService` and `createEmptySnapshot` with Vite
   SSR (`ssr.noExternal: true`). The optional current entry and runners are
   `/tmp/korus-acp-native-app-entry.ts`, `/tmp/korus-acp-native-app-proof.mjs`
   and `/tmp/korus-acp-native-review-proof.mjs`; these are evidence helpers,
   never production dependencies. Regenerate them from the service wiring in
   `backend/src/antigravity/__tests__/session.spec.ts` if scratch files expire.
3. Run the MCP runner with two same-cwd agents and the actual AppMcpService URL.
   Approve only their native `korus_set-status`/`korus_finish_turn` requests.
   Require distinct session IDs and both distinct status markers on the correct
   agent records. A completed ACP response alone is insufficient.
4. Give the review runner a **new** scratch directory each run. Initialize a
   disposable Git repo with `add(a,b) = a+b` and a Node test, commit its baseline,
   then change the implementation to subtraction. Use real CodeReviewService,
   ReviewGit and the scoped MCP bridge with `autoCommit:false`. Approve only
   fixture reads/test commands, the fixture-file edit and scoped review ledger
   calls. Require finding counts `[1,0]`, remediation evidence, passing Node
   test and reviewer disposal. Stop on quota rather than retrying or changing
   accounts. Capture synthetic results without credentials.
5. Keep the deterministic review/Mission/delegation/automation workflow tests
   green; report native results separately. Remote/Web attachment transfer and
   the upstream third-party model gate remain separate follow-ups.

## Verification and commit checkpoints

Every behavior milestone includes its tests; do not postpone them to a final
test-only commit. Keep native provider smoke tests opt-in and normal tests
deterministic. Apply `docs/testing.md`'s Test Value Gate, focused tests and affected
typechecks while iterating. Preserve exactly **85% statement coverage** gates
across all five workspaces, with full tests/coverage before release.

Coherent local checkpoints (commit/push only when authorized):

1. `chore: refresh antigravity integration plan with phase zero evidence`
2. `feat: add antigravity provider contracts and lifecycle`
3. `feat: add antigravity streaming transport and terminal handling`
4. `feat: add antigravity conversation history and scoped collaboration`
5. `feat: add antigravity settings and conversation ui`

## Completion criteria and learnings

The provider is done only when available selection, streaming, resume/hydration,
safe collaboration and truthful capabilities work across the supported entry
points. First-class does not mean every provider has identical features.

Phase 0 learnings:

- Inspect the installed binary as well as current official docs; even flags and
  timeout defaults differ. Record the tested version with each conclusion.
- Separate successful model context resume from durable UI transcript recovery.
- An exit code of zero can conceal tool denials and an empty assistant response.
- Test MCP identity isolation and home routing before committing to the transport.
- Check competitor implementation code early: a provider's CLI limitation may
  not apply to its official embedded transport. Then exercise that transport,
  rather than treating the competitor's source or advertised capabilities as proof.
- Stable session IDs do not imply stable tool IDs across cold history replay.
- Keep feasibility failures visible instead of replacing them with prompt-based
  imitations or unapproved API billing. No production feature code changed here.

Implementation learnings:

- Exercise the full provider-to-app boundary early. Native model generation,
  MCP discovery, permission to invoke an MCP tool, and app-ledger completion
  are separate assertions; an ACP `end_turn` proves none of the latter three.
- Preserve app prompt presentation metadata beside native history rather than
  persisting a competing transcript. Native replay can use different tool IDs
  and include injected instructions or flattened attachment contents.
- Test the external wire shapes with a real child process and run real owning
  app services around it. This catches bidirectional ID collisions, teardown,
  workflow completion and caller isolation without replacing production logic.
- Treat the native catalog as authoritative. A desktop model picker and a
  provider's shared model enum do not prove that an identified ACP client is
  offered that model; audit client capability/identity gates explicitly.
- Keep source-audited and fixture-backed behavior separate from native proof,
  especially when subscription limits interrupt a live test. Preserve the
  exact failed acceptance action and its rerun procedure rather than relaxing it.
