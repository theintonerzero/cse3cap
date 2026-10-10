"""Empties diary_ai, for the demo's reset (CAP-69, ADR #64).

    python -m sidecar.reset

Reads DATABASE_URL and DATABASE_CA like the app. Refuses any database but
diary_ai or a *_test one: this only ever empties the sidecar's own tables.
"""

import asyncio
import sys
from urllib.parse import urlparse

from .config import Settings
from .db import connect

TABLES = ("entry_vectors", "usage_log", "spend_days", "theme_cache", "rate_limits")


def refuse_unsafe(url: str) -> None:
    name = urlparse(url).path.lstrip("/")
    if name != "diary_ai" and not name.endswith("_test"):
        sys.exit(f"Error: DATABASE_URL names {name!r}. A sidecar reset only ever empties diary_ai.")


async def reset(pool) -> list[str]:
    async with pool.acquire() as conn, conn.cursor() as cur:
        for table in TABLES:
            await cur.execute(f"TRUNCATE TABLE {table}")
    return list(TABLES)


async def main() -> None:
    settings = Settings()
    if not settings.database_url:
        sys.exit("Error: DATABASE_URL is not set; the sidecar has no database to empty.")
    refuse_unsafe(settings.database_url)
    pool = await connect(settings.database_url, settings.database_ca)
    try:
        emptied = await reset(pool)
    finally:
        pool.close()
        await pool.wait_closed()
    print(f"==> emptied {', '.join(emptied)}")


if __name__ == "__main__":
    asyncio.run(main())
