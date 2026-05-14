import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
API_SOURCE = ROOT / "src" / "vibrary_backend" / "api.py"


class DesktopRendererCorsConfigTests(unittest.TestCase):
    def test_packaged_electron_file_origin_is_allowed(self) -> None:
        module = ast.parse(API_SOURCE.read_text(encoding="utf-8"))
        origins = None
        for node in module.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "DESKTOP_RENDERER_ORIGINS":
                        origins = ast.literal_eval(node.value)

        self.assertIsNotNone(origins)
        self.assertIn("null", origins)
        self.assertIn("file://", origins)


if __name__ == "__main__":
    unittest.main()
