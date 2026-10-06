"""Word alignment must reject missing/extra copy, not certify the script itself."""

import runpy
import unittest
from pathlib import Path

align_words = runpy.run_path(str(Path(__file__).with_name("check-local-narration.py")))["align_words"]


class AlignmentTest(unittest.TestCase):
    def test_recognized_words_own_caption_timing(self):
        words = [
            {"word": "Chorus", "start": 0.2, "end": 0.6},
            {"word": " works.", "start": 0.6, "end": 1.1},
            {"word": " A", "start": 1.5, "end": 1.6},
            {"word": " work", "start": 1.6, "end": 1.9},
            {"word": " tree.", "start": 1.9, "end": 2.2},
        ]
        copy = ["Korus works.", "A worktree."]
        self.assertEqual(align_words(copy, words), [
            {"text": copy[0], "start": 0.2, "spokenEnd": 1.1},
            {"text": copy[1], "start": 1.5, "spokenEnd": 2.2},
        ])
        for broken in (words[:-1], words + words[:1], words[1:] + words[:1]):
            with self.assertRaisesRegex(ValueError, "Spoken copy differs"):
                align_words(copy, broken)


if __name__ == "__main__":
    unittest.main()
