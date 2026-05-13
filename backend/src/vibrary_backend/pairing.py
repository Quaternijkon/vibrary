from __future__ import annotations

import secrets
import hashlib
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from .database import Database
from .timeutil import utc_now


@dataclass(frozen=True)
class PairingPayload:
    server_url: str
    pairing_code: str
    pairing_token: str
    expires_at: str


class PairingService:
    def __init__(self, db: Database):
        self.db = db

    def create_pairing_payload(self, server_url: str) -> PairingPayload:
        now = datetime.now(UTC)
        expires_at = (now + timedelta(minutes=10)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        created_at = now.replace(microsecond=0).isoformat().replace("+00:00", "Z")
        for _ in range(10):
            code = f"{secrets.randbelow(1_000_000):06d}"
            try:
                self.db.execute(
                    """
                    INSERT INTO pairing_tokens(token_hash, server_url, created_at, expires_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (_hash_token(code), server_url, created_at, expires_at),
                )
                return PairingPayload(server_url=server_url, pairing_code=code, pairing_token=code, expires_at=expires_at)
            except sqlite3.IntegrityError:
                continue
        raise RuntimeError("failed to create a unique pairing code")

    def trust_device(self, device_id: str, device_name: str, device_type: str = "android") -> None:
        self.db.upsert_device(device_id, device_name, device_type, is_trusted=True)

    def claim_device(self, pairing_token: str, device_id: str, device_name: str, device_type: str = "android") -> str:
        token_hash = _hash_token(pairing_token)
        row = self.db.one(
            """
            SELECT * FROM pairing_tokens
            WHERE token_hash = ? AND claimed_at IS NULL AND expires_at > ?
            """,
            (token_hash, utc_now()),
        )
        if row is None:
            raise PermissionError("invalid or expired pairing token")
        self.trust_device(device_id, device_name, device_type)
        bearer = secrets.token_urlsafe(32)
        now = utc_now()
        self.db.execute("UPDATE pairing_tokens SET claimed_at = ? WHERE token_hash = ?", (now, token_hash))
        self.db.execute(
            """
            INSERT INTO device_tokens(token_hash, device_id, created_at)
            VALUES (?, ?, ?)
            """,
            (_hash_token(bearer), device_id, now),
        )
        return bearer

    def validate_bearer_token(self, bearer_token: str) -> str | None:
        row = self.db.one(
            """
            SELECT dt.device_id
            FROM device_tokens dt
            JOIN devices d ON d.device_id = dt.device_id
            WHERE dt.token_hash = ? AND dt.revoked_at IS NULL AND d.is_trusted = 1
            """,
            (_hash_token(bearer_token),),
        )
        return str(row["device_id"]) if row else None

    def revoke_device(self, device_id: str) -> bool:
        now = utc_now()
        existing = self.db.one("SELECT device_id FROM devices WHERE device_id = ?", (device_id,))
        if existing is None:
            return False
        self.db.execute("UPDATE devices SET is_trusted = 0, last_seen_at = ? WHERE device_id = ?", (now, device_id))
        self.db.execute(
            "UPDATE device_tokens SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL",
            (now, device_id),
        )
        return True


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
