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

from vibrary_backend.config import AppPaths, BackendSettings, TEXT_COLLECTION
from vibrary_backend.vector_store import InMemoryVectorStore


class IndexMaintenanceApiTests(unittest.TestCase):
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
            auto_index=False,
        )
        self.vector_store = InMemoryVectorStore()
        self.app = create_app(settings=settings, vector_store=self.vector_store)
        self.client = TestClient(self.app, client=("127.0.0.1", 50000))

    def tearDown(self) -> None:
        if TestClient is not None:
            self.client.close()
            self.app.state.services.db.close()
        self.temp.cleanup()

    def test_index_status_reports_active_pipeline_and_queue_counts(self) -> None:
        response = self.client.get("/v1/index/status")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["pipeline"]["embedding"]["provider_id"], "jina-v5-omni-small")
        self.assertEqual(payload["pipeline"]["collections"]["text"], TEXT_COLLECTION)
        self.assertEqual(payload["queue_counts"], {})

    def test_rebuild_all_indexes_clears_active_records_and_requeues_assets(self) -> None:
        source = self.root / "note.txt"
        source.write_text("qdrant rebuild", encoding="utf-8")
        imported = self.client.post("/v1/imports/windows/files", json={"paths": [str(source)], "device_id": "windows-local"}).json()
        process = self.client.post("/v1/queues/indexing/process?limit=10", json={})
        self.assertEqual(process.json()["indexed_count"], 1)
        self.assertEqual(self.app.state.services.db.scalar("SELECT COUNT(*) FROM qdrant_points"), 1)

        response = self.client.post("/v1/index/rebuild", json={})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["queued_count"], 1)
        self.assertEqual(self.app.state.services.db.scalar("SELECT COUNT(*) FROM qdrant_points"), 0)
        self.assertEqual(self.app.state.services.db.scalar("SELECT COUNT(*) FROM search_documents"), 0)
        self.assertEqual(self.app.state.services.db.scalar("SELECT status FROM index_jobs"), "queued")
        self.assertEqual(imported["assets"][0]["asset_id"], self.app.state.services.db.scalar("SELECT asset_id FROM index_jobs"))


if __name__ == "__main__":
    unittest.main()
