import sys
import tempfile
import unittest
import importlib.util
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


class ApiSecurityTests(unittest.TestCase):
    def setUp(self) -> None:
        if TestClient is None:
            self.skipTest("fastapi is not installed")
        from vibrary_backend.api import create_app

        self.temp = tempfile.TemporaryDirectory()
        paths = AppPaths.from_root(Path(self.temp.name))
        settings = BackendSettings(
            paths=paths,
            backend_host="0.0.0.0",
            backend_port=8765,
            public_url="http://192.168.1.20:8765",
            qdrant_url="http://127.0.0.1:6333",
            qdrant_api_key="secret",
            use_qdrant=False,
        )
        self.app = create_app(settings=settings, vector_store=InMemoryVectorStore())
        self.local_client = TestClient(self.app, client=("127.0.0.1", 50000))
        self.remote_client = TestClient(self.app, client=("192.168.1.10", 50000))

    def tearDown(self) -> None:
        if TestClient is not None:
            self.local_client.close()
            self.remote_client.close()
            self.app.state.services.db.close()
        self.temp.cleanup()

    def test_pairing_qr_is_local_only(self) -> None:
        response = self.remote_client.get("/v1/pairing/qr")

        self.assertEqual(response.status_code, 403)

    def test_remote_claim_can_use_local_pairing_token_then_token_is_bound_to_device(self) -> None:
        qr = self.local_client.get("/v1/pairing/qr").json()
        claim = self.remote_client.post(
            "/v1/pairing/claim",
            json={"device_id": "android-1", "device_name": "Phone", "pairing_token": qr["pairing_token"]},
        )
        token = claim.json()["device_token"]

        allowed = self.remote_client.post(
            "/v1/uploads/preflight",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "device_id": "android-1",
                "local_ref_id": "local-1",
                "file_name": "a.txt",
                "mime_type": "text/plain",
                "size_bytes": 1,
                "quick_fingerprint": "a",
            },
        )
        spoofed = self.remote_client.post(
            "/v1/uploads/preflight",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "device_id": "android-2",
                "local_ref_id": "local-2",
                "file_name": "b.txt",
                "mime_type": "text/plain",
                "size_bytes": 1,
                "quick_fingerprint": "b",
            },
        )

        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(spoofed.status_code, 403)

    def test_remote_windows_import_is_rejected_even_for_paired_device(self) -> None:
        qr = self.local_client.get("/v1/pairing/qr").json()
        claim = self.remote_client.post(
            "/v1/pairing/claim",
            json={"device_id": "android-1", "device_name": "Phone", "pairing_token": qr["pairing_token"]},
        )
        token = claim.json()["device_token"]

        response = self.remote_client.post(
            "/v1/imports/windows/files",
            headers={"Authorization": f"Bearer {token}"},
            json={"device_id": "android-1", "paths": ["C:\\Users\\Ada\\secret.txt"]},
        )

        self.assertEqual(response.status_code, 403)

    def test_query_device_id_is_bound_to_remote_bearer_token(self) -> None:
        qr = self.local_client.get("/v1/pairing/qr").json()
        claim = self.remote_client.post(
            "/v1/pairing/claim",
            json={"device_id": "android-1", "device_name": "Phone", "pairing_token": qr["pairing_token"]},
        )
        token = claim.json()["device_token"]

        response = self.remote_client.get(
            "/v1/assets/missing/content?device_id=android-2",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)

    def test_remote_asset_content_requires_device_id_binding(self) -> None:
        qr = self.local_client.get("/v1/pairing/qr").json()
        claim = self.remote_client.post(
            "/v1/pairing/claim",
            json={"device_id": "android-1", "device_name": "Phone", "pairing_token": qr["pairing_token"]},
        )
        token = claim.json()["device_token"]

        response = self.remote_client.get(
            "/v1/assets/missing/content",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
