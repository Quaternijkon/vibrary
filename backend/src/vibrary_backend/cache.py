from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import shutil

from .config import AppPaths
from .database import Database


@dataclass(frozen=True)
class CacheClearResult:
    deleted_files: int
    deleted_bytes: int
    skipped_files: int


class CacheService:
    def __init__(self, db: Database, paths: AppPaths):
        self.db = db
        self.paths = paths

    def summary(self) -> dict[str, int]:
        rows = self.db.query(
            "SELECT cache_type, COALESCE(SUM(size_bytes), 0) AS bytes FROM cache_entries GROUP BY cache_type"
        )
        return {str(row["cache_type"]): int(row["bytes"]) for row in rows}

    def clear(self, cache_type: str) -> CacheClearResult:
        rows = self.db.query(
            "SELECT * FROM cache_entries WHERE cache_type = ? AND can_delete = 1",
            (cache_type,),
        )
        deleted_files = 0
        deleted_bytes = 0
        skipped_files = 0
        for row in rows:
            path = self.paths.resolve_data_path(str(row["relative_path"]))
            if not self._is_under_cache(path):
                skipped_files += 1
                continue
            if path.exists():
                deleted_bytes += self._size(path)
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
                deleted_files += 1
            self.db.execute("DELETE FROM cache_entries WHERE cache_entry_id = ?", (row["cache_entry_id"],))
        return CacheClearResult(deleted_files=deleted_files, deleted_bytes=deleted_bytes, skipped_files=skipped_files)

    def _is_under_cache(self, path: Path) -> bool:
        cache_root = self.paths.cache_dir.resolve()
        resolved = path.resolve()
        return resolved == cache_root or cache_root in resolved.parents

    def _size(self, path: Path) -> int:
        if path.is_file():
            return path.stat().st_size
        return sum(child.stat().st_size for child in path.rglob("*") if child.is_file())
