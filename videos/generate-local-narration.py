"""Generate one uninterrupted local narration per voice, outside Git."""

import argparse
import json
import hashlib
from pathlib import Path

import mlx.core as mx
import numpy as np
from huggingface_hub import snapshot_download
from mlx_audio.audio_io import write
from mlx_audio.tts.utils import load_model

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("film", default="delegation-film", nargs="?")
    parser.add_argument(
        "--output", type=Path,
        default=Path.home() / "Downloads/korus-delegation-voices",
    )
    parser.add_argument("--voice", help="Generate only one profile")
    parser.add_argument("--references", type=Path,
                        default=Path.home() / "Downloads/korus-voiceover-audition")
    parser.add_argument(
        "--seed", type=int, help="Override the seed when auditioning a new take"
    )
    args = parser.parse_args()
    script = json.loads((ROOT / "narration.json").read_text())
    settings = json.loads((ROOT / "local-voices.json").read_text())
    film = next((film for film in script["films"] if film["id"] == args.film), None)
    if film is None:
        parser.error(f"Unknown film: {args.film}")
    voices = [
        voice for voice in settings["voices"]
        if not args.voice or voice["id"] == args.voice
    ]
    if not voices:
        parser.error(f"Unknown voice: {args.voice}")

    checkpoint = snapshot_download(settings["model"], revision=settings["revision"])
    print("Loading Qwen3-TTS 1.7B BF16", flush=True)
    model = load_model(checkpoint)
    seed = args.seed if args.seed is not None else settings["seed"]
    for voice in voices:
        folder = args.output / voice["id"]
        folder.mkdir(parents=True, exist_ok=True)
        # Never generate cues independently: a prompt/seed is not a speaker ID.
        # Keep the model's acoustic history alive for the entire narration.
        text = " ".join(cue["text"] for cue in film["cues"])
        reference = args.references / f"ming-{voice['id']}-raw.wav"
        if not reference.is_file():
            raise FileNotFoundError(f"Approved voice reference is required: {reference}")
        report = {
            "model": settings["model"], "revision": settings["revision"],
            "voice": voice, "film": film["id"], "seed": seed,
            "mode": "continuous", "text": text,
            "cueTexts": [cue["text"] for cue in film["cues"]],
            "referenceSha256": hashlib.sha256(reference.read_bytes()).hexdigest(),
            "reference": str(reference), "referenceText": settings["referenceText"],
        }
        mx.random.seed(seed)
        print(f"{voice['title']} · one continuous take", flush=True)
        result = next(model.generate(
            text=text, ref_audio=str(reference), ref_text=settings["referenceText"],
            temperature=0.7, max_tokens=1600, lang_code="English",
        ))
        output = folder / "narration.wav"
        write(
            str(output), np.array(result.audio, dtype=np.float32),
            result.sample_rate, format="wav",
        )
        report.update({
            "duration": result.samples / result.sample_rate,
            "inferenceSeconds": result.processing_time_seconds,
            "audioSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        })
        print(
            f"  {report['duration']:.2f}s audio; "
            f"{report['inferenceSeconds']:.1f}s inference", flush=True,
        )
        (folder / "narration.json").write_text(json.dumps(report, indent=2))
        mx.clear_cache()


if __name__ == "__main__":
    main()
