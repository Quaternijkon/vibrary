from __future__ import annotations

import runpy
import unittest
from pathlib import Path


class PackagingEntryTests(unittest.TestCase):
    def test_backend_entry_imports_package_main_without_relative_import_error(self) -> None:
        entry = Path(__file__).resolve().parents[1] / "packaging" / "backend_entry.py"

        namespace = runpy.run_path(str(entry))

        self.assertIn("main", namespace)
        self.assertTrue(callable(namespace["main"]))


if __name__ == "__main__":
    unittest.main()
