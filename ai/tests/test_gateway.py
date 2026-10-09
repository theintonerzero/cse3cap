import json
import time
from decimal import Decimal

import pytest
from pytest_httpserver import HTTPServer
from werkzeug import Response

from sidecar.errors import AiError
from sidecar.gateway import ClaudeGateway, client_for
from sidecar.spend import Reservation

SCHEMA = {
    "type": "object",
    "properties": {"questions": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3}},
    "required": ["questions"],
    "additionalProperties": False,
}
IN, OUT = Decimal("0.10") / 1_000_000, Decimal("0.50") / 1_000_000


class Ledger:
    """The SpendLedger's two methods, in memory."""

    def __init__(self, refuse: bool = False):
        self.refuse, self.reserved, self.settled = refuse, [], []

    async def reserve(self, usd):
        if self.refuse:
            raise AiError("AI_UNAVAILABLE", 503, "x", {"reason": "daily_cap"})
        self.reserved.append(usd)
        return Reservation(None, usd)

    async def settle(self, reservation, feature, model, input_tokens, output_tokens, cost):
        self.settled.append((feature, model, input_tokens, output_tokens, cost))


def message(text: str, stop: str = "end_turn", input_tokens: int = 1000, output_tokens: int = 200) -> dict:
    return {
        "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-haiku-5-5",
        "stop_reason": stop, "stop_sequence": None,
        "content": [{"type": "text", "text": text}],
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
    }


def gateway(server: HTTPServer, ledger: Ledger, timeout: float = 15.0) -> ClaudeGateway:
    server.expect_request("/v1/messages/count_tokens").respond_with_json({"input_tokens": 1000})
    return ClaudeGateway(client_for("test-key", server.url_for("").rstrip("/"), timeout=timeout), ledger)


def messages_calls(server: HTTPServer) -> list:
    return [request for request, _ in server.log if request.path == "/v1/messages"]


async def test_reserves_the_worst_case_then_settles_the_actual(httpserver: HTTPServer):
    ledger = Ledger()
    httpserver.expect_request("/v1/messages", method="POST").respond_with_json(message(json.dumps({"questions": ["What happened next?"]})))
    out = await gateway(httpserver, ledger).ask("coach", "system", "data", SCHEMA, max_tokens=2048)
    assert out == {"questions": ["What happened next?"]}
    assert ledger.reserved == [1000 * IN + 2048 * OUT]
    assert ledger.settled == [("coach", "claude-haiku-5-5", 1000, 200, 1000 * IN + 200 * OUT)]


async def test_sends_haiku_medium_effort_structured_output_and_no_tools(httpserver: HTTPServer):
    httpserver.expect_request("/v1/messages", method="POST").respond_with_json(message(json.dumps({"questions": ["Why?"]})))
    await gateway(httpserver, Ledger()).ask("coach", "system", "data", SCHEMA)
    body = json.loads(messages_calls(httpserver)[0].data)
    assert body["model"] == "claude-haiku-5-5" and "tools" not in body
    assert body["output_config"] == {"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}}


async def test_the_cap_refuses_before_claude_is_called(httpserver: HTTPServer):
    with pytest.raises(AiError) as e:
        await gateway(httpserver, Ledger(refuse=True)).ask("coach", "s", "d", SCHEMA)
    assert e.value.details == {"reason": "daily_cap"}
    assert messages_calls(httpserver) == []


async def test_refusal_is_ai_unavailable_refusal(httpserver: HTTPServer):
    ledger = Ledger()
    httpserver.expect_request("/v1/messages", method="POST").respond_with_json(message("", stop="refusal"))
    with pytest.raises(AiError) as e:
        await gateway(httpserver, ledger).ask("coach", "s", "d", SCHEMA)
    assert e.value.details == {"reason": "refusal"} and len(ledger.settled) == 1


async def test_reply_outside_schema_is_invalid_reply(httpserver: HTTPServer):
    httpserver.expect_request("/v1/messages", method="POST").respond_with_json(message(json.dumps({"answer": "a level 3"})))
    with pytest.raises(AiError) as e:
        await gateway(httpserver, Ledger()).ask("coach", "s", "d", SCHEMA)
    assert e.value.details == {"reason": "invalid_reply"}


async def test_one_retry_on_a_5xx_then_upstream(httpserver: HTTPServer):
    ledger = Ledger()
    httpserver.expect_request("/v1/messages", method="POST").respond_with_json(
        {"type": "error", "error": {"type": "api_error", "message": "x"}}, status=500
    )
    with pytest.raises(AiError) as e:
        await gateway(httpserver, ledger).ask("coach", "s", "d", SCHEMA)
    assert e.value.details == {"reason": "upstream"}
    assert len(messages_calls(httpserver)) == 2
    assert ledger.settled[0][2:] == (0, 0, Decimal(0))  # nothing spent: the reservation is released at zero


async def test_timeout_is_ai_unavailable_timeout(httpserver: HTTPServer):
    def slow(_request):
        time.sleep(1)
        return Response(json.dumps(message(json.dumps({"questions": ["Late?"]}))), content_type="application/json")

    httpserver.expect_request("/v1/messages", method="POST").respond_with_handler(slow)
    ledger = Ledger()
    with pytest.raises(AiError) as e:
        await gateway(httpserver, ledger, timeout=0.2).ask("coach", "s", "d", SCHEMA)
    assert e.value.details == {"reason": "timeout"}
    # Claude may have billed a call the sidecar stopped waiting for, so the cap
    # counts what was reserved for it, not nothing (core review M1).
    assert ledger.settled[0][4] == ledger.reserved[0] > 0


async def test_a_prompt_over_100k_tokens_is_refused_before_reserving():
    # Priced as a short prompt it would be reserved too low (M2), so it is refused.
    # Its own server: an earlier test's slow handler can still be answering on the shared one.
    server = HTTPServer()
    server.start()
    try:
        server.expect_request("/v1/messages/count_tokens").respond_with_json({"input_tokens": 100_001})
        ledger = Ledger()
        with pytest.raises(AiError) as e:
            await ClaudeGateway(client_for("k", server.url_for("").rstrip("/")), ledger).ask("themes", "s", "d", SCHEMA)
        assert e.value.details == {"reason": "too_long"}
        assert ledger.reserved == [] and messages_calls(server) == []
    finally:
        server.stop()
