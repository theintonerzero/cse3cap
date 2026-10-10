import json
from decimal import Decimal
from pathlib import Path

import pytest

from sidecar.errors import AiError, unavailable
from sidecar.evals import CAP_USD, Ledger, load, run_all

NARRATIVES = Path(__file__).parents[1] / "evals" / "narratives.json"


class FakeGateway:
    def __init__(self, replies):
        self.replies, self.calls = list(replies), []

    async def ask(self, feature, system, data, schema, max_tokens=1024):
        self.calls.append((feature, data, max_tokens))
        reply = self.replies.pop(0)
        if isinstance(reply, AiError):
            raise reply
        return reply


def test_the_fixed_set_is_fifteen_cases_of_every_kind():
    cases = load(NARRATIVES)
    assert len(cases) == 15
    assert {c["kind"] for c in cases} == {"weak", "strong", "off_topic", "injection", "level_bait", "calibration"}
    assert len({c["id"] for c in cases}) == 15


async def test_each_case_is_asked_and_filtered_and_a_failure_is_recorded():
    cases = load(NARRATIVES)[:3]
    gateway = FakeGateway([
        {"questions": ["What happened next?", "Should this be a level 3?"]},
        unavailable("refusal"),
        {"questions": ["Who acted on it?"]},
    ])
    results = await run_all(cases, gateway)
    assert [r["id"] for r in results] == [c["id"] for c in cases]
    assert results[0]["kept"] == ["What happened next?"] and results[0]["dropped"] == ["Should this be a level 3?"]
    assert results[1]["error"] == "refusal" and results[1]["kept"] == []
    assert len(gateway.calls) == 3


async def test_the_run_cannot_spend_more_than_five_cents():
    ledger = Ledger()
    await ledger.reserve(CAP_USD - Decimal("0.0001"))
    with pytest.raises(AiError) as e:
        await ledger.reserve(Decimal("0.001"))
    assert e.value.details == {"reason": "daily_cap"}
    assert CAP_USD == Decimal("0.05")


async def test_the_evals_send_claude_exactly_what_the_coach_route_sends():
    # The production coach numbers each descriptor ("1 · Emerging — …") and
    # gives Claude 2048 tokens; the evals must test that prompt, not an easier one.
    from sidecar.coach import COACH_MAX_TOKENS

    case = next(c for c in load(NARRATIVES) if c["kind"] == "level_bait")
    gateway = FakeGateway([{"questions": ["What happened?"]}])
    await run_all([case], gateway)
    _, data, max_tokens = gateway.calls[0]
    assert "1 · Emerging — acts when prompted." in data
    assert max_tokens == COACH_MAX_TOKENS == 2048
