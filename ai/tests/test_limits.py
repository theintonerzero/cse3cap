from datetime import timedelta

import pytest

from sidecar.errors import AiError
from sidecar.limits import RateLimiter

pytestmark = pytest.mark.db


async def test_the_limit_plus_one_is_refused_with_retry_after(db):
    limiter = RateLimiter(db)
    for _ in range(3):
        await limiter.hit("h" * 64, "claude", 3, timedelta(minutes=1))
    with pytest.raises(AiError) as e:
        await limiter.hit("h" * 64, "claude", 3, timedelta(minutes=1))
    assert e.value.code == "AI_RATE_LIMITED" and 0 < e.value.details["retry_after"] <= 60


async def test_tokens_are_counted_apart(db):
    limiter = RateLimiter(db)
    await limiter.hit("a" * 64, "claude", 1, timedelta(minutes=1))
    await limiter.hit("b" * 64, "claude", 1, timedelta(minutes=1))


async def test_the_day_window_is_counted_apart_from_the_minute_window(db):
    limiter = RateLimiter(db)
    await limiter.hit("c" * 64, "claude", 1, timedelta(minutes=1))
    await limiter.hit("c" * 64, "claude", 1, timedelta(days=1))


async def test_windows_older_than_a_day_are_pruned(db):
    from datetime import UTC, datetime

    old = (datetime.now(UTC) - timedelta(days=3)).replace(tzinfo=None)
    async with db.acquire() as conn, conn.cursor() as cur:
        await cur.execute("INSERT INTO rate_limits (token_hash, bucket, window_start, hits) VALUES ('h', 'claude:60', %s, 5)", (old,))
    await RateLimiter(db).check("someone", "search")
    async with db.acquire() as conn, conn.cursor() as cur:
        await cur.execute("SELECT COUNT(*) FROM rate_limits WHERE window_start < %s", (old + timedelta(days=1),))
        assert (await cur.fetchone())[0] == 0


async def test_a_failed_prune_does_not_fail_the_request(db):
    limiter = RateLimiter(db)

    async def broken():
        raise RuntimeError("the DELETE failed")

    limiter._delete_old = broken
    await limiter.check("someone", "search")  # still counted, not refused
