import json
from collections.abc import Sequence
from datetime import UTC, datetime

import aiomysql


class VectorStore:
    """The only code that touches entry_vectors. MySQL stores and Python ranks:
    MySQL 9.7 Community can't compare two vectors (ADR #64)."""

    def __init__(self, pool: aiomysql.Pool):
        self._pool = pool

    async def vectors(self, entry_ids: Sequence[str]) -> dict[str, tuple[str, list[float]]]:
        """entry_id -> (content_hash, vector), for these ids and no others."""
        if not entry_ids:
            return {}
        marks = ",".join(["%s"] * len(entry_ids))
        async with self._pool.acquire() as conn, conn.cursor() as cur:
            await cur.execute(
                f"SELECT entry_id, content_hash, VECTOR_TO_STRING(embedding) FROM entry_vectors WHERE entry_id IN ({marks})",
                list(entry_ids),
            )
            return {row[0]: (row[1], json.loads(row[2])) for row in await cur.fetchall()}

    async def put(self, entry_id: str, content_hash: str, vector: list[float]) -> None:
        async with self._pool.acquire() as conn, conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO entry_vectors (entry_id, content_hash, embedding, created_at) "
                "VALUES (%s, %s, STRING_TO_VECTOR(%s), %s) AS new "
                "ON DUPLICATE KEY UPDATE content_hash = new.content_hash, embedding = new.embedding, created_at = new.created_at",
                (entry_id, content_hash, json.dumps(vector), datetime.now(UTC).replace(tzinfo=None)),
            )
