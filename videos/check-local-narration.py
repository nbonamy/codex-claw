"""Check complete copy, align captions, and report speaker consistency locally."""

import argparse
import hashlib
import json
import re
from pathlib import Path

import mlx_whisper
import numpy as np
import soundfile as sf
from resemblyzer import VoiceEncoder, preprocess_wav

ROOT = Path(__file__).resolve().parent


def normalize(text):
    # Homophone/spelling differences are expected from independent recognition.
    text = re.sub(r"\bchorus\b", "korus", text.lower())
    return re.sub(r"[^a-z0-9]", "", text)


def align_words(cue_texts, words):
    observed = "".join(normalize(word["word"]) for word in words)
    expected = "".join(normalize(text) for text in cue_texts)
    if observed != expected:
        raise ValueError("Spoken copy differs from the script; inspect the transcript before export.")
    spans = []
    cursor = 0
    for word in words:
        size = len(normalize(word["word"]))
        if size:
            spans.append((cursor, cursor + size, word))
        cursor += size
    cursor = 0
    cues = []
    for text in cue_texts:
        end = cursor + len(normalize(text))
        selected = [word for a, b, word in spans if b > cursor and a < end]
        cues.append({"text": text, "start": selected[0]["start"],
                     "spokenEnd": selected[-1]["end"]})
        cursor = end
    return cues


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path,
                        default=ROOT / "local/voice-comparison")
    parser.add_argument("--voice")
    args = parser.parse_args()
    settings = json.loads((ROOT / "local-voices.json").read_text())
    if args.voice and args.voice not in {voice["id"] for voice in settings["voices"]}:
        parser.error(f"Unknown voice: {args.voice}")
    encoder = VoiceEncoder(device="cpu")
    for voice in settings["voices"]:
        if args.voice and args.voice != voice["id"]:
            continue
        stem = args.output / voice["id"] / "narration"
        source = stem.with_suffix(".wav")
        provenance = json.loads(stem.with_suffix(".json").read_text())
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        if digest != provenance["audioSha256"] or provenance["mode"] != "continuous":
            raise ValueError("Stale audio provenance; regenerate before checking.")
        if hashlib.sha256(Path(provenance["reference"]).read_bytes()).hexdigest() != provenance["referenceSha256"]:
            raise ValueError("The approved reference changed after generation.")
        transcript = mlx_whisper.transcribe(
            str(source), path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
            language="en", word_timestamps=True, temperature=0,
        )
        # Save diagnostic output even on failure; never invent aligned captions
        # for missing/repeated text or hide a failed check with the known script.
        stem.with_name("narration-transcript.json").write_text(json.dumps(transcript, indent=2))
        print(voice["title"], transcript["text"], flush=True)
        words = [word for segment in transcript["segments"] for word in segment["words"]]
        cues = align_words(provenance["cueTexts"], words)
        audio, rate = sf.read(source, dtype="float32")
        reference = encoder.embed_utterance(preprocess_wav(Path(provenance["reference"])))
        embeddings = np.array([
            encoder.embed_utterance(preprocess_wav(
                audio[int(cue["start"] * rate):int(cue["spokenEnd"] * rate)], rate
            )) for cue in cues
        ])
        scores = embeddings @ reference
        adjacent = np.sum(embeddings[:-1] * embeddings[1:], axis=1)
        report = {
            "audioSha256": digest, "duration": len(audio) / rate, "cues": cues,
            "speakerCheck": {
                "model": "resemblyzer-0.1.4", "referenceSimilarity": scores.tolist(),
                "adjacentSimilarity": adjacent.tolist(),
                "note": "Diagnostic similarity, not a guarantee of perceived voice quality.",
            },
        }
        print("reference similarities:", np.round(scores, 3), flush=True)
        print("adjacent similarities:", np.round(adjacent, 3), flush=True)
        # A local screening threshold, not a universal speaker-verification
        # claim. The rejected sentence-generated takes score as low as 0.48.
        report["speakerCheck"]["passed"] = bool(min(scores) >= 0.8 and min(adjacent) >= 0.8)
        stem.with_name("narration-aligned.json").write_text(json.dumps(report, indent=2))
        if not report["speakerCheck"]["passed"]:
            raise ValueError("Speaker consistency screen failed; do not export this take.")


if __name__ == "__main__":
    main()
