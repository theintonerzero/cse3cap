from datetime import UTC, datetime, timedelta

from .errors import AiError

LIMITS = {
    "claude": [(20, timedelta(minutes=1)), (200, timedelta(days=1))],
    "search": [(60, timedelta(minutes=1))],
}


class RateLimiter:
    """Fixed windows per SHA-256 of the token (ADR #64). The token is never stored."""

    def __init__(self, pool):
        self._pool = pool

    async def hit(self, token_hash: str, bucket: str, limit: int, window: timedelta) -> None:
        now = datetime.now(UTC)
        seconds = window.total_seconds()
        start = datetime.fromtimestamp((now.timestamp() // seconds) * seconds, UTC)
        key = f"{bucket}:{int(seconds)}"
        naive_start = start.replace(tzinfo=None)
        async with self._pool.acquire() as conn, conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO rate_limits (token_hash, bucket, window_start, hits) VALUES (%s, %s, %s, 1) AS new "
                "ON DUPLICATE KEY UPDATE hits = rate_limits.hits + 1",
                (token_hash, key, naive_start),
            )
            await cur.execute(
                "SELECT hits FROM rate_limits WHERE token_hash = %s AND bucket = %s AND window_start = %s",
                (token_hash, key, naive_start),
            )
            (hits,) = await cur.fetchone()
        if hits > limit:
            retry_after = max(1, int((start + window - now).total_seconds()))
            raise AiError("AI_RATE_LIMITED", 429, "Too many requests. Try again shortly.", {"retry_after": retry_after})

    async def check(self, token_hash: str, bucket: str) -> None:
        for limit, window in LIMITS[bucket]:
            await self.hit(token_hash, bucket, limit, window)
