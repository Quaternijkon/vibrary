import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class JinaRuntimePackagingTests(unittest.TestCase):
    def test_backend_requirements_include_jina_remote_code_dependencies(self) -> None:
        requirements = (ROOT / "backend" / "requirements.txt").read_text(encoding="utf-8")

        self.assertIn("peft", requirements)
        self.assertIn("accelerate", requirements)
        self.assertIn("torchvision", requirements)

    def test_release_builder_collects_jina_remote_code_dependencies(self) -> None:
        script = (ROOT / "scripts" / "build_release.ps1").read_text(encoding="utf-8")

        self.assertIn('"--collect-all", "peft"', script)
        self.assertIn('"--collect-all", "accelerate"', script)
        self.assertIn('"--collect-all", "torchvision"', script)


if __name__ == "__main__":
    unittest.main()
