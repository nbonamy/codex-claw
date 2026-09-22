# Open-source text-to-speech for Codex Claw

Research snapshot: 2026-09-02. This memo uses project-owned repositories,
documentation, model cards, licenses, and release artifacts. Performance numbers
are vendor or runtime-maintainer measurements, not a common independent bake-off.

## Recommendation

The resolved product use case is deliberately narrow: an agent may speak one
short acknowledgment when it starts work and one short completion phrase when
it finishes. It must not narrate reasoning, tool output, or the full response.
That removes the need for voice cloning, true streaming, long-form stability,
or a large multilingual model.

For that use case, **start with KittenTTS Nano 0.8 int8 behind a signed Swift
helper**. The model is about 25–31 MB depending on packaging, CPU-oriented,
Apache-2.0, and offers eight English voices. The official Swift SDK supports
macOS 14+, async generation/playback, the int8 Nano model, and a built-in
phonemizer that avoids an eSpeak runtime dependency. Its developer-preview
status still warrants a small listening and cold-start test before shipping.
([KittenTTS repository](https://github.com/KittenML/KittenTTS),
[official Swift SDK](https://github.com/KittenML/KittenTTS-swift),
[official int8 model files](https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8/tree/main))

Build the integration around a **signed native TTS helper with the model
downloaded on demand**, not Python/PyTorch embedded in Electron and not
inference in the renderer. Keep the helper warm while tasks are active so the
start phrase pays model initialization at most once and the finish phrase is
immediate.

Keep `AVSpeechSynthesizer` as the zero-download fallback. It is not open source,
but it is built into macOS and covers first launch, a missing model, download
failure, and accessibility needs without increasing the app bundle.
([Apple API](https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer),
[voice API](https://developer.apple.com/documentation/avfaudio/avspeechsynthesisvoice))

Only move up to Kokoro or Pocket TTS if the focused listening test shows that
Kitten's short-phrase quality is not good enough. Kokoro is the cleanly licensed
quality step-up; Pocket is the active streaming/voice-cloning step-up, but both
solve requirements this feature does not currently have and cost substantially
more disk and integration complexity.

## Shortlist

Sizes below are model artifacts, not total installed size, unless noted.
Runtime libraries, voices, phonemizers, and CoreML compilation caches can add
materially more.

| Candidate                 | Size / runtime                                                                                                                                                                                   | Streaming and Apple Silicon evidence                                                                                                                    | Languages / voices                                                                                                                                                                  | Redistribution                                                                                             | Verdict                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Kokoro 82M**            | The ONNX-community q8 conversion is about 86 MB; FluidAudio's CoreML package is about 330 MB                                                                                                     | FluidAudio: full waveform 241/305 ms p50/p95, 31x aggregate real-time on M5 Pro; no true streaming                                                      | Upstream has 54 voices across American/British English, Japanese, Mandarin, Spanish, French, Hindi, Italian, and Brazilian Portuguese; upstream warns that non-English data is thin | Apache-2.0 code and weights; some runtimes add GPL eSpeak, but FluidAudio's English path uses a CoreML G2P | **Best clean quality upgrade on macOS**, subject to voice/product test                           |
| **Pocket TTS v3**         | Official checkpoint 236 MB; FluidAudio benchmark says about 330 MB, while its separate model-file guide totals 549 MB for the retained int8 CoreML configuration—pin and measure before shipping | True streaming. Upstream: about 200 ms first chunk and 6x real-time on M4 Air CPU. FluidAudio: 26/27 ms first 80 ms frame and 6.51x aggregate on M5 Pro | English, French, German, Portuguese, Italian, Spanish; preset voices and cloning                                                                                                    | MIT code; gated CC-BY-4.0 weights plus use restrictions and per-voice terms                                | **Best streaming experience**, legal/product review required                                     |
| **KittenTTS 0.8 Nano**    | Official int8 sherpa archive about 31 MB; project describes 15M/40M/80M models at roughly 25–80 MB                                                                                               | CPU/ONNX; no official comparable Mac benchmark. Example streams sentence/text chunks, not model frames                                                  | English only, eight preset voices                                                                                                                                                   | Apache-2.0 model/code; Python reference loads GPL eSpeak, while the Swift SDK has a built-in phonemizer    | **Best fit for short cues**, still a developer preview                                           |
| **MOSS-TTS-Nano 100M**    | Official ONNX repository is about 672 MB despite the 100M-parameter headline                                                                                                                     | Project claims streaming generation on four CPU cores; ONNX browser demo exists, but there is no comparable Apple Silicon benchmark                     | 20 languages and reference-driven voice cloning                                                                                                                                     | Apache-2.0                                                                                                 | Promising multilingual newcomer, but too new and too large to make the default                   |
| **Inflect v2 Micro/Nano** | 37.5 MB / 16.0 MB ONNX                                                                                                                                                                           | Author reports 6.28x / 10.72x real-time on a managed CPU; punctuation chunking, not acoustic streaming                                                  | English, one fixed male voice                                                                                                                                                       | Apache-2.0                                                                                                 | Interesting tiny fallback, too immature and inflexible for default                               |
| **Piper**                 | Typical voice is roughly 60–115 MB, plus runtime                                                                                                                                                 | Fast CPU VITS/ONNX; broad native platform support; synthesis is fundamentally utterance/chunk based                                                     | Broad language catalog; each voice has its own license                                                                                                                              | Current maintained fork is GPL-3.0; every voice model card must be checked                                 | Mature utility option, but license and maintenance posture are weaker                            |
| **Supertonic 3**          | FluidAudio int4 about 100 MB; sherpa int8 release about 129 MB                                                                                                                                   | FluidAudio: 81/120 ms full waveform, 94x real-time on M5 Pro; no true streaming                                                                         | 31 languages, fixed voices and style controls                                                                                                                                       | OpenRAIL-M weights, MIT SDK                                                                                | Technically excellent, **do not adopt**: vendor announced repository archival and end of support |
| **NeuTTS Air / Nano**     | Nano Q4 + int8 codec about 507 MB; Air Q4 + codec about 839 MB                                                                                                                                   | GGUF streaming; author reports 195/111 language-model tokens/s on M4, explicitly excluding codec time                                                   | English plus model-dependent French, German, Spanish; instant cloning                                                                                                               | Air weights Apache; Nano uses a custom license whose free commercial tier is limited by entity revenue     | Too large and license-complex for this use                                                       |
| **OuteTTS 1.0 0.6B**      | Q2 GGUF about 301 MB; Q4 about 387–402 MB, plus codec/runtime                                                                                                                                    | llama.cpp/Transformers backends; no official comparable Apple/TTFA result                                                                               | 14 languages; reference audio drives voice                                                                                                                                          | Apache-2.0                                                                                                 | Viable research option, but larger and less deployment-proven here                               |
| **Chatterbox Turbo/Nano** | Despite a 110M text model, official Nano repository artifacts total about 3 GB; a usable path still needs the 870 MB T3 and roughly 1.06 GB vocoder                                              | Official Nano claim: more than 3x real-time on an 8-core CPU; cloning and paralinguistic tags                                                           | Nano is English                                                                                                                                                                     | MIT                                                                                                        | Good capability, wrong size/runtime class                                                        |
| **Qwen3-TTS 0.6B**        | Official 0.6B CustomVoice repository is about 2.5 GB including tokenizer                                                                                                                         | Official claim as low as 97 ms first audio; streaming; GPU-oriented reference stack                                                                     | 10 languages; cloning, design, and control                                                                                                                                          | Apache-2.0                                                                                                 | High-quality feature ceiling, much too large for embedded default                                |

Sources for the table:

- Kokoro: [upstream repository](https://github.com/hexgrad/kokoro),
  [voice inventory and caveats](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md),
  [ONNX artifacts](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/main/onnx),
  [FluidAudio benchmark](https://github.com/FluidInference/FluidAudio/blob/main/Documentation/TTS/Benchmarks.md), and
  [FluidAudio G2P/runtime details](https://github.com/FluidInference/FluidAudio/blob/main/Documentation/TTS/KokoroAne.md).
- Pocket TTS: [upstream repository](https://github.com/kyutai-labs/pocket-tts),
  [official checkpoint](https://huggingface.co/kyutai/pocket-tts/tree/main),
  [model card/terms](https://huggingface.co/kyutai/pocket-tts), and
  [FluidAudio model-file totals](https://github.com/FluidInference/FluidAudio/blob/main/Documentation/TTS/PocketTTS.md).
- KittenTTS: [upstream repository](https://github.com/KittenML/KittenTTS),
  [official int8 model files](https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8/tree/main),
  [requirements](https://github.com/KittenML/KittenTTS/blob/main/requirements.txt), and
  [sherpa-onnx release assets](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models).
- MOSS-TTS-Nano: [official repository](https://github.com/OpenMOSS/MOSS-TTS-Nano) and
  [official ONNX model files](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX/tree/main).
- Inflect: [official repository and v2 model table](https://github.com/owenawsong/Inflect).
- Piper: [current repository](https://github.com/OHF-Voice/piper1-gpl),
  [voice-license warning](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md), and
  [example voice artifacts](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium).
- Supertonic: [official repository and archival notice](https://github.com/supertone-inc/supertonic),
  [official model files/license](https://huggingface.co/Supertone/supertonic-3), and
  [FluidAudio benchmark](https://github.com/FluidInference/FluidAudio/blob/main/Documentation/TTS/Benchmarks.md).
- NeuTTS: [official repository, licenses, and M4 measurements](https://github.com/neuphonic/neutts),
  [Nano Q4 file](https://huggingface.co/neuphonic/neutts-nano-q4-gguf/tree/main), and
  [codec file](https://huggingface.co/neuphonic/neucodec-onnx-decoder/tree/main).
- OuteTTS: [official repository](https://github.com/edwko/OuteTTS) and
  [official model files/card](https://huggingface.co/OuteAI/OuteTTS-1.0-0.6B).
- Chatterbox: [official repository](https://github.com/resemble-ai/chatterbox) and
  [official Nano model files/card](https://huggingface.co/ResembleAI/chatterbox-nano).
- Qwen3-TTS: [official repository](https://github.com/QwenLM/Qwen3-TTS) and
  [official 0.6B files/card](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice).

## Maintenance snapshot

Maintenance changes the ranking materially:

- **Pocket TTS is current and moving quickly.** Its official v3.0.2 release was
  published on 2026-08-25, and the repository documents an August 2026 training
  code release. That is the healthiest upstream among the new streaming models.
  ([releases](https://github.com/kyutai-labs/pocket-tts/releases),
  [repository](https://github.com/kyutai-labs/pocket-tts))
- **FluidAudio and sherpa-onnx are active deployment layers.** FluidAudio's
  current README installs 0.12.4 and its repository contains ongoing 2026
  CoreML TTS work; sherpa-onnx published v1.13.7 on 2026-09-01 and added
  KittenTTS 0.8 support during the 1.13 line.
  ([FluidAudio](https://github.com/FluidInference/FluidAudio),
  [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases))
- **KittenTTS is current but explicitly pre-production.** The latest tagged
  release is v0.8.1 from 2026-02-24, while the README still labels the project a
  developer preview and warns that APIs may change.
  ([releases](https://github.com/KittenML/KittenTTS/releases),
  [README](https://github.com/KittenML/KittenTTS))
- **MOSS-TTS-Nano is active but extremely young.** The repository was created
  in April 2026 and remains active, but it has no tagged release yet. Treat its
  20-language, four-core streaming claims as promising evaluation targets, not
  production maturity evidence.
  ([repository](https://github.com/OpenMOSS/MOSS-TTS-Nano),
  [ONNX files](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX/tree/main))
- **Kokoro's upstream model is stable rather than fast-moving.** The upstream
  repository has no formal release train; most deployment activity now occurs
  in runtimes and conversions such as FluidAudio, sherpa-onnx, and
  kokoro-onnx. That makes the runtime pin and regression corpus especially
  important.
  ([upstream repository](https://github.com/hexgrad/kokoro),
  [kokoro-onnx repository](https://github.com/thewh1teagle/kokoro-onnx))
- **Piper's successor is maintained but fragile.** OHF-Voice's GPL fork tagged
  v1.4.2 in April 2026, while its README also says the project is looking for
  maintainers. The original rhasspy repository is archived.
  ([current releases](https://github.com/OHF-Voice/piper1-gpl/releases),
  [current README](https://github.com/OHF-Voice/piper1-gpl),
  [archived original](https://github.com/rhasspy/piper))
- **Supertonic is a hard maintenance exclusion.** The vendor says the
  repository will be archived and no further development or support will be
  provided, despite the model's excellent size and speed.
  ([official notice](https://github.com/supertone-inc/supertonic))

## Other requested candidates

These are not competitive defaults for an offline, size-conscious commercial
desktop app in 2026:

| Candidate           | Why it falls behind                                                                                                                                                                                                                   | Primary sources                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MeloTTS**         | CPU real-time and multilingual, but its official English checkpoint is about 208 MB and the project/model line has not materially advanced since 2024. Its Python/PyTorch frontend is less attractive than current ONNX/CoreML paths. | [repository](https://github.com/myshell-ai/MeloTTS), [English v3 files](https://huggingface.co/myshell-ai/MeloTTS-English-v3/tree/main)                           |
| **StyleTTS2**       | Strong research model, but the reference path is research-oriented, English-centric, large, and uses a GPL phonemizer unless replaced. FluidAudio's available CoreML path is about 670 MB and has no streaming.                       | [repository](https://github.com/yl4579/StyleTTS2), [FluidAudio benchmark](https://github.com/FluidInference/FluidAudio/blob/main/Documentation/TTS/Benchmarks.md) |
| **Coqui XTTS v2**   | The official checkpoint is about 1.86 GB and the Coqui Public Model License restricts use to non-commercial purposes. That is not a redistributable default for Claw.                                                                 | [model files](https://huggingface.co/coqui/XTTS-v2/tree/main), [license](https://huggingface.co/coqui/XTTS-v2/blob/main/LICENSE.txt)                              |
| **Parler-TTS Mini** | Apache-2.0 and supports streamed generation, but Mini is 880M parameters with roughly 3.5 GB of weights; the official model line dates to 2024.                                                                                       | [repository](https://github.com/huggingface/parler-tts), [Mini files/card](https://huggingface.co/parler-tts/parler-tts-mini-v1.1/tree/main)                      |
| **Fish Speech**     | Capable, but current weights use the Fish Audio Research License; commercial use requires separate written permission. It also belongs to a much larger deployment class.                                                             | [repository and license](https://github.com/fishaudio/fish-speech)                                                                                                |
| **F5-TTS**          | Code is MIT, but the official pretrained weights are CC-BY-NC because of their training data.                                                                                                                                         | [official inference/license note](https://github.com/SWivid/F5-TTS/blob/main/src/f5_tts/infer/SHARED.md)                                                          |

## Runtime and licensing findings

### “Apache model” does not guarantee an Apache distributable

Kokoro and KittenTTS are permissively licensed at the model/project level, but
their common reference frontends use eSpeak NG for phonemization. eSpeak NG is
GPL-3.0, and sherpa-onnx's TTS build fetches and links its eSpeak fork when TTS
is enabled. That does not necessarily prevent shipping a separate helper, but
it changes source-offer, notice, and binary-distribution obligations and needs
an explicit legal/compliance decision.
([eSpeak NG license](https://github.com/espeak-ng/espeak-ng/blob/master/COPYING),
[sherpa-onnx eSpeak build integration](https://github.com/k2-fsa/sherpa-onnx/blob/master/cmake/espeak-ng-for-piper.cmake),
[KittenTTS loader](https://github.com/KittenML/KittenTTS/blob/main/kittentts/onnx_model.py))

The recommended FluidAudio Kokoro English route avoids that particular issue:
its pipeline is text → a CoreML BART G2P → IPA → Kokoro, and the Swift package
is Apache-2.0. It currently trades upstream Kokoro's voice breadth for a single
English voice in this optimized path.
([FluidAudio Kokoro design](https://github.com/FluidInference/FluidAudio/blob/main/Documentation/TTS/KokoroAne.md),
[FluidAudio license](https://github.com/FluidInference/FluidAudio/blob/main/LICENSE))

### “Open weights” is not always open source

Pocket TTS's official model card labels the weights CC-BY-4.0 but also gates
download behind additional use restrictions. NeuTTS Nano has a custom license
with a revenue threshold. Supertonic uses OpenRAIL-M. XTTS is non-commercial by
default, while Fish Speech requires a separate commercial license. Treat each
model revision and every downloaded voice as an independently versioned
licensed asset; do not infer its terms from the inference engine's license.
([Pocket TTS model card](https://huggingface.co/kyutai/pocket-tts),
[NeuTTS license](https://github.com/neuphonic/neutts/blob/main/LICENSE),
[Supertonic model card](https://huggingface.co/Supertone/supertonic-3),
[XTTS license](https://huggingface.co/coqui/XTTS-v2/blob/main/LICENSE.txt),
[Fish Speech license](https://github.com/fishaudio/fish-speech/blob/main/LICENSE))

### Native runtime choices

**FluidAudio is the strongest macOS-specific integration seam.** It is an active
Apache-2.0 Swift package for local CoreML audio inference, currently exposes
Kokoro and Pocket TTS, supports offline-only/manual model loading, and avoids a
Python distribution. Its benchmark methodology publishes cold start, true
first-frame latency versus full-waveform latency, memory, and ASR-roundtrip
quality rather than quoting only real-time factor.
([FluidAudio repository](https://github.com/FluidInference/FluidAudio),
[offline/model registry controls](https://github.com/FluidInference/FluidAudio#configuration),
[benchmark methodology](https://github.com/FluidInference/FluidAudio/blob/main/Documentation/TTS/Benchmarks.md))

**sherpa-onnx is the strongest cross-platform native engine**, with C/C++,
Swift, Java, Kotlin, C#, Dart, Go, Rust, and Node.js bindings and current support
for Kokoro, KittenTTS, Pocket TTS, Piper, and other ONNX voices. Its Node addon
can work in a standalone Node process, but direct Electron native-addon use adds
ABI/rebuild coupling; a versioned native helper is a cleaner boundary. Also,
the documented Node TTS API is non-streaming today, and the eSpeak linkage noted
above must be handled deliberately.
([sherpa-onnx repository](https://github.com/k2-fsa/sherpa-onnx),
[TTS documentation](https://k2-fsa.github.io/sherpa/onnx/tts/index.html),
[Node addon examples](https://github.com/k2-fsa/sherpa-onnx/blob/master/nodejs-addon-examples/README.md))

## Proposed Codex Claw architecture

Codex Claw's existing process boundaries point to one design:

```text
renderer playback/UI
       │ app-owned IPC/events (start, PCM chunks, progress, end, error)
       ▼
Electron desktop adapter ── framed stdio ── signed Swift TTS helper
       │                                      │
       │                                      ├─ KittenTTS/ONNX model
       │                                      └─ AVSpeechSynthesizer fallback
       ▼
app-owned capability / clawd client callback when orchestration needs it
```

- Keep synthesis out of Vue and out of Electron's main thread. The renderer
  should only request speech, play PCM, expose pause/cancel, and show download
  state.
- Ship and sign one small universal/native helper with the app. Download models
  after opt-in into a content-addressed application-support cache. Bundling a
  300–550 MB model in every DMG would tax every download and app update.
- Give the helper a narrow, engine-neutral protocol such as `voices`,
  `synthesize`, `cancel`, and `health`. Emit format metadata once, then
  backpressure-aware PCM frames. Put text cleanup/chunking and pronunciation
  policy behind the same interface so engines remain replaceable.
- Store a manifest next to each model with source URL, immutable revision,
  SHA-256, byte size, model/voice licenses, acknowledgement version, and engine
  compatibility. Support resumable download, integrity verification, repair,
  and deletion.
- Treat model installation and model loading separately. Show exact disk cost
  before download. Never silently fetch gated/restricted weights.
- Let the helper own CoreML and native audio inference, but keep audio playback
  in the app so cancellation, volume, mixing, captions, and accessibility state
  remain product-controlled.
- Preserve an engine abstraction. A future Windows/Linux helper can use
  sherpa-onnx without leaking model/runtime branches into renderer components.

### MCP surface

Expose the product behavior as an optional acknowledgment on
`codex_claw.set-status`, not as an unrestricted general-purpose `tts` tool or a
second standalone MCP call. The nested schema communicates the actual intent:

```text
set-status({
  status: string,
  announcement?: { phase: "start" | "finish", text: string <= 160 characters }
})
```

- Describe the tool as a best-effort, short user-facing cue. Explicitly forbid
  narration of reasoning, transcripts, command output, code, and secrets.
- Put the start/finish usage rule in the agent prompt as well as the tool
  description; tool descriptions alone are not reliable session-wide policy.
- Return when playback is queued, not when it ends, so speech never delays the
  task. Rate-limit and coalesce announcements per agent.
- Gate the effect behind an opt-in user setting. With several agents running,
  default to the selected agent so the computer does not become a room full of
  overlapping voices.
- Model the optional audio side after the existing transient `celebrate` path:
  MCP handling in `clawd`, app-owned client effect, native helper playback, and
  a bounded tool result. The same operation also updates `agent.statusText`.

This aligns with the repository's documented ownership: Electron owns native
desktop helpers, signed resources, and IPC; backend-specific/process concerns
stay behind app-owned contracts; the renderer owns presentation rather than
arbitrary local process or filesystem access.
([architecture](../architecture.md),
[backend architecture](../backend-architecture.md),
[protocol](../protocol.md))

## Bake-off before implementation

Test **Kitten Nano** and the **Apple fallback** first. Add Kokoro/FluidAudio only
if Kitten fails the quality bar. Test on M1, M2/M3, and a current M-series Mac,
using warm and cold runs.
For each engine record:

- helper + model download and installed bytes;
- cold initialization, warm initialization, first audible frame, total
  synthesis time, peak RSS, and sustained CPU/energy;
- cancellation latency and whether chunk boundaries are audible;
- pronunciation of short natural task cues, contractions, names such as Codex
  Claw and GitHub, and occasional filenames or acronyms;
- blind preference and intelligibility across at least 50 representative 2–12
  word utterances;
- overlap behavior when several agents start or finish close together;
- license provenance for the exact runtime, model revision, and each voice.

Choose Kitten if its short acknowledgments are pleasant and model initialization
does not delay the first cue. Choose the Apple fallback when zero setup matters
more than an open model. Escalate to Kokoro only if Kitten's voice quality or
pronunciation misses the bar. The architecture should make that product decision
reversible.
