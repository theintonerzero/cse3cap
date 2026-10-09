from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from .errors import unavailable


def money(usd: Decimal) -> Decimal:
    """To the ledger's six decimals (DECIMAL(12,6)), so nothing is truncated by the
    driver and the reserved total doesn't drift (core review M3)."""
    return Decimal(usd).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class Reservation:
    day: date
    usd: Decimal


class SpendLedger:
    """The US$-per-UTC-day cap (ADR #64). A call reserves its worst case before
    it is made and settles its real cost after. The day's row is locked while a
    reservation is checked, so two calls can't both take the last of the cap."""

    def __init__(self, pool, cap_usd: Decimal):
        self._pool, self._cap = pool, cap_usd

    async def reserve(self, usd: Decimal) -> Reservation:
        usd = money(usd)
        today = datetime.now(UTC).date()
        async with self._pool.acquire() as conn:
            await conn.begin()
            try:
                async with conn.cursor() as cur:
                    await cur.execute("INSERT INTO spend_days (day) VALUES (%s) AS new ON DUPLICATE KEY UPDATE day = new.day", (today,))
                    await cur.execute("SELECT reserved_usd + spent_usd FROM spend_days WHERE day = %s FOR UPDATE", (today,))
                    (committed,) = await cur.fetchone()
                    if committed + usd > self._cap:
                        raise unavailable("daily_cap")
                    await cur.execute("UPDATE spend_days SET reserved_usd = reserved_usd + %s WHERE day = %s", (usd, today))
                await conn.commit()
            except BaseException:
                await conn.rollback()
                raise
        return Reservation(today, usd)

    async def settle(self, reservation: Reservation, feature: str, model: str,
                     input_tokens: int, output_tokens: int, cost_usd: Decimal) -> None:
        cost_usd = money(cost_usd)
        async with self._pool.acquire() as conn, conn.cursor() as cur:
            await cur.execute(
                "UPDATE spend_days SET reserved_usd = reserved_usd - %s, spent_usd = spent_usd + %s WHERE day = %s",
                (reservation.usd, cost_usd, reservation.day),
            )
            await cur.execute(
                "INSERT INTO usage_log (feature, model, input_tokens, output_tokens, cost_usd, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (feature, model, input_tokens, output_tokens, cost_usd, datetime.now(UTC).replace(tzinfo=None)),
            )
