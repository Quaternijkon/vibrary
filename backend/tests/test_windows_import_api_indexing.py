import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


HAS_FASTAPI = importlib.util.find_spec("fastapi") is not None
if HAS_FASTAPI:
    from fastapi.testclient import TestClient
else:
    TestClient = None


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vibrary_backend.config import AppPaths, BackendSettings
from vibrary_backend.vector_store import InMemoryVectorStore


class WindowsImportApiIndexingTests(unittest.TestCase):
    def setUp(self) -> None:
        if TestClient is None:
            self.skipTest("fastapi is not installed")
        from vibrary_backend.api import create_app

        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.paths = AppPaths.from_root(self.root / "data-root")
        settings = BackendSettings(
            paths=self.paths,
            backend_host="127.0.0.1",
            backend_port=8765,
            public_url="http://127.0.0.1:8765",
            qdrant_url="http://127.0.0.1:6333",
            qdrant_api_key="secret",
            use_qdrant=False,
            auto_index=True,
        )
        self.vector_store = InMemoryVectorStore()
        self.app = create_app(settings=settings, vector_store=self.vector_store)
        self.client = TestClient(self.app, client=("127.0.0.1", 50000))

    def tearDown(self) -> None:
        if TestClient is not None:
            self.client.close()
            self.app.state.services.db.close()
        self.temp.cleanup()

    def test_windows_file_import_kicks_background_indexing(self) -> None:
        source = self.root / "note.txt"
        source.write_text("desktop import should become searchable", encoding="utf-8")

        response = self.client.post("/v1/imports/windows/files", json={"paths": [str(source)], "device_id": "windows-local"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["index_queued_count"], 1)
        self.assertEqual(self.app.state.services.db.scalar("SELECT status FROM index_jobs"), "completed")
        self.assertEqual(self.app.state.services.db.scalar("SELECT COUNT(*) FROM qdrant_points"), 1)
        self.assertEqual(self.app.state.services.db.scalar("SELECT COUNT(*) FROM search_documents"), 1)
        self.assertEqual(len(self.vector_store.upsert_calls), 1)


if __name__ == "__main__":
    unittest.main()
