import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from vibrary_backend.config import BackendSettings
from vibrary_backend.database import Database
from vibrary_backend.pairing import PairingService


class ConfigAndPairingTests(unittest.TestCase):
    def test_backend_settings_read_sidecar_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            env = {
                "VIBRARY_DATA_DIR": temp_dir,
                "VIBRARY_BACKEND_HOST": "0.0.0.0",
                "VIBRARY_BACKEND_PORT": "9876",
                "VIBRARY_PUBLIC_URL": "http://192.168.1.20:9876",
                "VIBRARY_QDRANT_URL": "http://127.0.0.1:6333",
                "VIBRARY_QDRANT_API_KEY": "secret",
            }
            with patch.dict(os.environ, env, clear=False):
                settings = BackendSettings.from_env()

            self.assertEqual(settings.paths.root, Path(temp_dir).resolve())
            self.assertEqual(settings.backend_host, "0.0.0.0")
            self.assertEqual(settings.backend_port, 9876)
            self.assertEqual(settings.public_url, "http://192.168.1.20:9876")
            self.assertEqual(settings.qdrant_api_key, "secret")

    def test_pairing_token_must_be_claimed_to_get_device_bearer_token(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db = Database(Path(temp_dir) / "app.sqlite")
            db.initialize()
            pairing = PairingService(db)
            payload = pairing.create_pairing_payload("http://192.168.1.20:8765")

            self.assertRegex(payload.pairing_code, r"^\d{6}$")
            self.assertEqual(payload.pairing_token, payload.pairing_code)

            with self.assertRaises(PermissionError):
                pairing.claim_device("bad-token", "android-1", "Phone")

            bearer = pairing.claim_device(payload.pairing_token, "android-1", "Phone")

            self.assertEqual(pairing.validate_bearer_token(bearer), "android-1")
            self.assertIsNone(pairing.validate_bearer_token("bad-token"))
            self.assertEqual(db.scalar("SELECT is_trusted FROM devices WHERE device_id = ?", ("android-1",)), 1)
            db.close()

    def test_revoking_device_invalidates_existing_bearer_tokens(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            db = Database(Path(temp_dir) / "app.sqlite")
            db.initialize()
            pairing = PairingService(db)
            payload = pairing.create_pairing_payload("http://192.168.1.20:8765")
            bearer = pairing.claim_device(payload.pairing_code, "android-1", "Phone")

            pairing.revoke_device("android-1")

            self.assertIsNone(pairing.validate_bearer_token(bearer))
            self.assertEqual(db.scalar("SELECT is_trusted FROM devices WHERE device_id = ?", ("android-1",)), 0)
            self.assertIsNotNone(db.scalar("SELECT revoked_at FROM device_tokens WHERE device_id = ?", ("android-1",)))
            db.close()


if __name__ == "__main__":
    unittest.main()
