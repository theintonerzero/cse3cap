import asyncio
from decimal import Decimal

import pytest

from sidecar.errors import AiError
from sidecar.spend import SpendLedger

pytestmark = pytest.mark.db


async def test_a_call_that_would_cross_the_cap_is_refused(db):
    ledger = SpendLedger(db, Decimal("0.010"))
    await ledger.reserve(Decimal("0.008"))
    with pytest.raises(AiError) as e:
        await ledger.reserve(Decimal("0.003"))
    assert (e.value.code, e.value.details) == ("AI_UNAVAILABLE", {"reason": "daily_cap"})


async def test_settling_releases_the_reservation_and_records_the_actual(db):
    ledger = SpendLedger(db, Decimal("0.010"))
    reservation = await ledger.reserve(Decimal("0.008"))
    await ledger.settle(reservation, "coach", "claude-haiku-5-5", 1200, 300, Decimal("0.000270"))
    await ledger.reserve(Decimal("0.009"))  # fits: 0.00027 spent and nothing else reserved
    async with db.acquire() as conn, conn.cursor() as cur:
        await cur.execute("SELECT feature, input_tokens, output_tokens, cost_usd FROM usage_log")
        assert await cur.fetchall() == (("coach", 1200, 300, Decimal("0.000270")),)


async def test_two_reservations_cannot_both_take_the_last_of_the_cap(db):
    ledger = SpendLedger(db, Decimal("0.010"))
    # The day's row exists after the day's first call; the race is between two
    # calls after that. On a fresh day the row's insert serialises them anyway.
    await ledger.settle(await ledger.reserve(Decimal("0.001")), "coach", "m", 0, 0, Decimal("0"))
    results = await asyncio.gather(
        ledger.reserve(Decimal("0.006")), ledger.reserve(Decimal("0.006")), return_exceptions=True
    )
    assert sum(isinstance(r, AiError) for r in results) == 1
