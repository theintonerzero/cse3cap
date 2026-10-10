import json
import logging
from decimal import Decimal

import anthropic

from .errors import unavailable

log = logging.getLogger("sidecar.gateway")

# claude-haiku-5-5, prompts up to 100K tokens (ADR #64). Thinking is billed as
# output, so the worst case of a call is its counted input plus max_tokens out.
PRICE_IN = Decimal("0.10") / 1_000_000
PRICE_OUT = Decimal("0.50") / 1_000_000
# These prices hold for prompts up to 100K tokens; a longer one costs more, so
# it is refused rather than reserved too low (core review M2).
MAX_INPUT_TOKENS = 100_000
# client_for's max_retries=1: a call that times out may be two billed attempts.
ATTEMPTS = 2


def client_for(api_key: str | None, base_url: str | None = None, timeout: float = 15.0) -> anthropic.AsyncAnthropic:
    """15 seconds, and one retry on 429, 5xx or a connection error: the SDK's own retry."""
    return anthropic.AsyncAnthropic(api_key=api_key, base_url=base_url, timeout=timeout, max_retries=1)


def _valid(value: object, schema: dict) -> bool:
    """The reply's shape, checked again here. Structured output constrains it;
    this is the line a reply crosses before any of it reaches a student."""
    kind = schema.get("type")
    if kind == "object":
        properties = schema.get("properties", {})
        return (
            isinstance(value, dict)
            and set(schema.get("required", [])) <= set(value) <= set(properties)
            and all(_valid(value[key], properties[key]) for key in value)
        )
    if kind == "array":
        return (
            isinstance(value, list)
            and schema.get("minItems", 0) <= len(value) <= schema.get("maxItems", len(value))
            and all(_valid(item, schema["items"]) for item in value)
        )
    if kind == "string":
        return isinstance(value, str)
    return False


class ClaudeGateway:
    """The only code that calls Claude: the spend cap, the timeout and retry,
    refusals, and what each call cost."""

    def __init__(self, client: anthropic.AsyncAnthropic, ledger, model: str = "claude-haiku-5-5"):
        self._client, self._ledger, self._model = client, ledger, model

    async def ask(self, feature: str, system: str, data: str, schema: dict, max_tokens: int = 2048) -> dict:
        messages = [{"role": "user", "content": data}]
        output_config = {"effort": "medium", "format": {"type": "json_schema", "schema": schema}}
        try:
            counted = await self._client.messages.count_tokens(
                model=self._model, system=system, messages=messages, output_config=output_config
            )
        except anthropic.APITimeoutError:
            log.warning("Claude timed out (%s)", feature)
            raise unavailable("timeout")
        except (anthropic.APIStatusError, anthropic.APIConnectionError):
            log.warning("Claude call failed (%s)", feature, exc_info=True)
            raise unavailable("upstream")

        if counted.input_tokens > MAX_INPUT_TOKENS:
            raise unavailable("too_long")
        worst = counted.input_tokens * PRICE_IN + max_tokens * PRICE_OUT
        reservation = await self._ledger.reserve(worst)
        used_in = used_out = 0
        # A timed-out or dropped call may still have been billed, twice with the
        # SDK's retry: until a reply says what it cost, it counts the worst case
        # of every attempt against the cap (M1, CAP-67 review).
        cost = worst * ATTEMPTS
        try:
            response = await self._client.messages.create(
                model=self._model, max_tokens=max_tokens, system=system, messages=messages, output_config=output_config
            )
            used_in, used_out = response.usage.input_tokens, response.usage.output_tokens
            cost = used_in * PRICE_IN + used_out * PRICE_OUT
        except anthropic.APITimeoutError:
            log.warning("Claude timed out (%s)", feature)
            raise unavailable("timeout")
        except anthropic.APIStatusError:
            # An error answer is not a billed completion.
            cost = Decimal(0)
            log.warning("Claude call failed (%s)", feature, exc_info=True)
            raise unavailable("upstream")
        except anthropic.APIConnectionError:
            log.warning("Claude call failed (%s)", feature, exc_info=True)
            raise unavailable("upstream")
        finally:
            await self._ledger.settle(reservation, feature, self._model, used_in, used_out, cost)

        if response.stop_reason == "refusal":
            raise unavailable("refusal")  # Haiku has no server-side fallback, and nothing retries a refusal
        text = "".join(block.text for block in response.content if block.type == "text")
        try:
            value = json.loads(text)
        except ValueError:
            raise unavailable("invalid_reply")
        if not _valid(value, schema):
            raise unavailable("invalid_reply")
        return value
