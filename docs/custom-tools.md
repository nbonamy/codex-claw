# Custom MCP Tools

This guide covers app-owned tools exposed by the `codex_claw` MCP server. A
tool is a product capability, not only an MCP schema: `clawd` owns its behavior,
the app-owned protocol carries any client effect, and Vue owns its presentation.

Use the smallest path that satisfies the behavior. A pure coordinator query
does not need a renderer event. A native desktop action does.

## End-to-end path

```text
backend agent
  -> codex_claw MCP tool
  -> clawd coordinator/service
  -> optional app-owned backend event or client request
  -> renderer or Electron effect
```

Provider adapters only make the MCP server available to their backend. Tool
semantics remain provider-neutral.

## Implementation sequence

1. Define the domain input and result.
2. Implement the behavior in the coordinator or an injected service callback.
3. Register the MCP schema and handler.
4. Add an app-owned event or client request only when the effect crosses the
   backend boundary.
5. Add custom tool-row presentation when the generic `Ran …` title is not
   sufficient.
6. Cover every boundary the tool crosses.

The implementation is complete when the tool is model-discoverable, its result
is bounded and useful, its UI effect is observable, and its live and restored
tool rows render the same meaning.

## Registering a tool

Tool families are self-contained modules resolved for each authenticated MCP
request. `backend/src/mcp/tools.ts` only creates the server and composes the
modules returned by the configured providers. Core collaboration, Missions,
Review, Browser, and Computer Use each own their registration module.

Add a tool to the module that owns its product behavior. For a new contextual
family such as Design, create one `ClawMcpToolModuleProvider` whose `resolve`
method returns a module only for an agent in that context, then attach the
provider through `ClawMcpServiceOptions.toolModuleProviders`. Do not add a
Design branch to the server composer or to unrelated tool modules.

Providers and resolved modules have stable unique IDs. Composition rejects
duplicate IDs so two independently configured families cannot silently shadow
one another. Modules may also declare ownership of a shared workflow capability;
the composer derives the shared tool surface from those declarations. For
example, Mission owns proposed actions, so the collaboration module exposes a
`finish_turn` schema without generic proposal flags. A module registers all of
the tools for its family:

```ts
const designTools: ClawMcpToolModuleProvider = {
  id: 'design',
  resolve: ({ agentId }) => designs.contextForAgent(agentId) ? {
    id: 'design',
    register: server => registerDesignTools(server, designs, agentId),
  } : undefined,
};
```

The description is behavioral policy available to the model. State the trigger,
scope, and restraint there. Put mandatory cross-tool workflow rules in
`backend/src/mcp/agent-prompts.ts` as well; a tool description alone is not a
reliable place for session-wide policy.

Caller identity comes from the agent-scoped MCP URL. Do not add a caller agent
ID to the input schema.

Use `loggedToolResult()` for normal registrations so logging and error
conversion stay consistent. Return deliberate domain errors with
`McpToolError`; unexpected errors still become MCP results with `isError: true`.

## Domain behavior and effects

Put agent/team state transitions in `ClawMcpAgentCoordinator`. Inject product
effects as callbacks rather than giving the coordinator renderer or Electron
dependencies.

Use `ClawMcpService` when the operation needs the application snapshot, a
backend driver, persistence, or an app-owned event. Define shared event payloads
in `core/src/contracts.ts`, reduce durable state in core, and handle transient
visual effects in Vue.

Only route through Electron when the capability is genuinely native. Renderer
code never calls MCP directly.

## Status has two meanings

### Agent collaboration status

`set-status` changes the agent itself and may queue a spoken acknowledgment in
the same operation:

```text
set-status
  -> coordinator updates agent.statusText
  -> service emits agent.updated
  -> renderer shows the short status to users and teammates
```

The service clears the status automatically when the provider turn completes.
An empty value remains available for an intentional early clear. `statusText`
is independent from the agent's runtime state (`idle`, `working`,
`awaitingInput`, or `error`). It should remain short and describe the current
activity, not repeat a transcript. The optional `announcement` object carries a
bounded `start` or `finish` phrase through the existing native audio path.

If a new tool changes agent state, make the state transition explicit and emit
the matching app-owned event. Do not infer agent state from how a tool row is
rendered.

### Tool-call lifecycle

Every MCP call also has a presentation lifecycle:

- `running`: the call is in progress;
- `completed`: the call returned successfully;
- `failed`: the call returned an error.

This lifecycle belongs to the conversation tool row. It does not update
`agent.statusText`. Without a Claw presenter, the SDK uses a generic title such
as `Ran codex_claw.example-tool`.

## Structured results and bounded presentation data

Return machine-readable results with `structuredToolResult()` from
`backend/src/mcp/tool-result.ts`. Keep the stable facts needed by the model and
UI at predictable keys:

```ts
return {
  success: true,
  kind: 'schoolPride',
  message: 'Celebration requested.',
};
```

Claw intentionally does not persist arbitrary tool input and output. Provider
payloads may contain large command output, screenshots, file content, secrets,
or deeply nested data. `backend/src/codex/codex-surface-adapter.ts` projects a
small set of presentation-safe keys before messages enter app state and stdio
snapshots.

When a custom title needs a new value:

1. Use a small semantic scalar or bounded object.
2. Add only that key to the relevant input or output presentation projection.
3. Add a real-shape adapter regression proving it survives both live and
   hydrated history.
4. Keep large or sensitive siblings absent from the projected result.

A denylist is not suitable here: a newly introduced provider field would enter
durable snapshots before Claw knew whether it was large or sensitive.

## Custom tool-row presentation

Claw extends the SDK presentation surface in:

- `vue/src/tool-presentation.ts`: recognized tools and icons;
- `vue/src/tool-title-presenter.ts`: phase-aware titles and targets;
- `vue/src/i18n/surface-messages.ts`: localized running, completed, and failed
  strings.

Add the tool to `TOOL_KEYS`, assign its semantic icon group, and provide all
three lifecycle strings. Titles should describe the action and a short target:

```text
Creating worktree feature/review-flow
Created worktree feature/review-flow
Failed creating worktree feature/review-flow
```

The presenter may resolve a target from bounded tool arguments or structured
results. It must tolerate missing fields because an old conversation may have
been persisted before that presentation metadata existed.

Keep icons semantic and reuse an existing group where possible. Tool rows are
status summaries, not diagnostics; raw IDs and payload details belong in
expanded content or logs.

## Worked examples

### `set-status`: state-changing tool

`set-status` demonstrates a durable state change with an optional transient
effect in one model round trip:

- schema and behavioral description in `backend/src/mcp/tools.ts`;
- normalization and state mutation in `ClawMcpAgentCoordinator.setStatus()`;
- `agent.updated` emission in `ClawMcpService`;
- optional bounded announcement validation and native queueing through the same
  coordinator call;
- automatic cleanup from the provider-independent `turn.completed` lifecycle;
- a special completed title for clearing status in
  `vue/src/tool-title-presenter.ts`.

Its MCP result confirms the operation. The visible agent status comes from the
app event, not from the result text.

### `finish_turn`: atomic end-of-turn state and effects

`finish_turn` clears collaboration status and can select one flag, queue one
finish acknowledgment, and request one celebration in the same final model
call. Claw keeps a strict flag allowlist in Core. Flags describe typed thread
state rather than presentation. The payload-free flags are:

- `delegate_to_worktree`, which submits a fixed delegation prompt through the
  normal app-owned prompt path when the user accepts it;
- `ready_for_review`, a pre-commit affordance set only when the intended
  uncommitted diff is complete, validated, and ready for user review. Agents
  skip it for explicit immediate commit/push requests.

Passing a new flag replaces the current proposal; omitting it preserves any
existing proposal. Claw clears a flag after its accepted action succeeds or on
manual dismissal. Failed actions keep the flag active for retry. Headless
clients can ignore or act on the same durable state without a UI-specific
contract. Its optional effects remain transient:

- `announcement.text` is trimmed and bounded to 160 characters; its phase is
  always `finish`;
- `celebration.kind` is limited to the supported visual effects;
- the coordinator validates the caller and delegates the effect;
- the service emits `client.celebrationRequested` without consulting shared navigation;
- Vue applies the receiving client's selection/settings and handles the transient
  event without persisting it in app state;
- the tool result confirms `requested`, not `displayed`: emitting an effect does
  not prove any receiving client chose to show it;
- the Debug menu exposes the same effect variants for deterministic visual QA.

### Spoken acknowledgments through status and completion

`set-status` and `finish_turn` own the transient native audio option alongside
their durable lifecycle updates:

- stable developer instructions require the first status update to include one
  short start acknowledgment and reserve the optional finish acknowledgment for
  `finish_turn`;
- both nested schemas trim text to 1–160 characters and imply their lifecycle
  phase from the owning tool;
- the coordinator validates the caller, updates `agent.statusText`, and
  delegates the optional acknowledgment;
- the service applies backend-owned global enablement and dictated-input policy,
  then sends the provider-neutral `client/spokenAnnouncement/queue` request
  without a voice or client-selection assumption;
- Electron chooses the current client's voice and checks mute, selected-agent
  and foreground eligibility when accepting
  playback and cancels active or pending speech when it becomes ineligible;
- Electron returns as soon as its bounded global queue accepts the request,
  coalesces pending phrases, rate-limits repeated phases, and owns native helper
  cancellation;
- the MCP result confirms the requested status and optional phase while the
  phrase and detailed suppression reason remain private;
- Vue renders the Voice settings section and rail mute control. The section
  owns enablement, selected-agent and foreground scope, a
  curated Kokoro voice picker, and a local preview action. Claw-owned normalized
  renderer projections omit the spoken text and playback result; provider-native
  conversation replicas remain provider-owned.

The macOS helper uses FluidAudio 0.15.5 with Kokoro 82M Core ML audio and
`AVAudioPlayer`; it does not use `AVSpeechSynthesizer`. The helper binary is
built and signed with the app, while model and phonemizer data download on the
first enabled use and remain outside the app bundle. A measured first-use cache
is about 190 MiB because FluidAudio retains downloaded model packages beside
compiled Core ML artifacts. There is no system-voice fallback: native synthesis
failure is silent and never fails or delays the agent task.

The default voice is `af_heart`. Seven additional English Kokoro voice packs
are fetched individually from the Apache-2.0 upstream model at a pinned
revision when first selected or previewed. The helper extracts the raw stored
tensor, checks its exact size and pinned SHA-256 digest, and places it in
FluidAudio's cache. Preview uses the same global Electron queue as agent speech
with the fixed phrase “Codex Claw is on it—sharp claws, clean code,” so previews
cannot overlap live acknowledgments.

The original KittenTTS 0.1.0 integration gate was rejected before product
wiring because its official Swift package exports unsafe target flags, which
SwiftPM refuses when consumed as a dependency. Its packaged phonemizer assets
also carry GPL-3.0 licensing. Kokoro through FluidAudio is the smallest clean
native alternative verified under the app's build and signing constraints.

Keep future platforms behind the same one-phrase helper protocol. A Windows or
Linux implementation may use sherpa-onnx without introducing renderer branches
or provider-specific MCP contracts.

## Tests

Add focused tests at every owned seam the tool crosses:

- `backend/src/mcp/__tests__/tools.spec.ts`: registration, schema, and routing;
- `backend/src/mcp/__tests__/agent-coordinator.spec.ts`: domain behavior and
  validation;
- `backend/src/mcp/__tests__/service.spec.ts`: snapshot mutation, settings,
  events, and client effects;
- `backend/src/codex/__tests__/codex-surface-adapter.spec.ts`: bounded input and
  result metadata used by presentation;
- `core/src/__tests__`: reducer behavior for durable app state;
- `vue/src/__tests__/tool-title-presenter.spec.ts`: running, completed, failed,
  missing metadata, and human-readable targets;
- `vue/src/__tests__/tool-presentation.spec.ts`: icon and presenter routing;
- component or app-state tests for any visible effect.

Run the smallest red test first. Before handoff, run the affected package
typechecks, lint/build gates, `git diff --check`, and the Codex Claw Definition
of Done.
