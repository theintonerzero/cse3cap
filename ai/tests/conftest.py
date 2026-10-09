import os
from pathlib import Path

import pytest

SCHEMA = Path(__file__).parents[1] / "db" / "01-schema.sql"
TABLES = ("entry_vectors", "usage_log", "spend_days", "theme_cache", "rate_limits")


@pytest.fixture
async def db():
    """A pool on a throwaway diary_ai, rebuilt from ai/db/01-schema.sql for each test."""
    url = os.environ.get("AI_TEST_DATABASE_URL")
    if not url:
        pytest.skip("AI_TEST_DATABASE_URL is unset: point it at a throwaway MySQL, never the shared one (ai/README.md)")
    if "rddb.darkovski.dev" in url:
        pytest.fail("AI_TEST_DATABASE_URL names the shared server. These tests drop tables.")
    from sidecar.db import connect

    pool = await connect(url)
    async with pool.acquire() as conn, conn.cursor() as cur:
        await cur.execute("SET sql_notes = 0")  # DROP IF EXISTS on a fresh database is a note, not a problem
        for table in TABLES:
            await cur.execute(f"DROP TABLE IF EXISTS {table}")
        for statement in filter(str.strip, SCHEMA.read_text().split(";")):
            await cur.execute(statement)
    yield pool
    pool.close()
    await pool.wait_closed()
