import pytest

from sidecar.reset import refuse_unsafe, reset

pytestmark = pytest.mark.db


async def test_a_reset_empties_every_table(db):
    async with db.acquire() as conn, conn.cursor() as cur:
        await cur.execute("INSERT INTO theme_cache (gig_id, day, themes, created_at) VALUES ('g', '2026-10-10', '[]', NOW(6))")
        await cur.execute("INSERT INTO rate_limits (token_hash, bucket, window_start, hits) VALUES ('h', 'b', NOW(6), 1)")
    emptied = await reset(db)
    assert set(emptied) == {"entry_vectors", "usage_log", "spend_days", "theme_cache", "rate_limits"}
    async with db.acquire() as conn, conn.cursor() as cur:
        for table in emptied:
            await cur.execute(f"SELECT COUNT(*) FROM {table}")
            assert (await cur.fetchone())[0] == 0


def test_only_diary_ai_or_a_test_database_is_reset():
    for ok in ("mysql://u:p@h/diary_ai", "mysql://u:p@h/diary_ai_test"):
        refuse_unsafe(ok)
    for bad in ("mysql://u:p@h/reflection_diary_demo", "mysql://u:p@h/reflection_diary", "mysql://u:p@h/"):
        with pytest.raises(SystemExit):
            refuse_unsafe(bad)
