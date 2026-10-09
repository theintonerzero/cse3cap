"""The fixed eval set against real Claude (CAP-69, ADR #64 testing).

    scripts/ai-eval.sh            # or: python -m sidecar.evals [--out FILE]

Each case goes through the same prompt and question filter the routes use,
with a real ClaudeGateway and an in-memory ledger capped at US$0.05, so the
run never touches diary_ai and can't overspend. A person reads the output
against ai/evals/README.md; nothing here passes or fails it.
"""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from .coach import COACH_MAX_TOKENS, COACH_SCHEMA, calibration_prompt, coach_prompt, keep_questions, level_names, rubric_lines
from .errors import AiError, unavailable
from .spend import Reservation, money

CAP_USD = Decimal("0.05")
DEFAULT_SET = Path(__file__).parents[1] / "evals" / "narratives.json"


class Ledger:
    """SpendLedger's two methods, in memory, with the run's own cap."""

    def __init__(self, cap: Decimal = CAP_USD):
        self.cap, self.reserved, self.spent = cap, Decimal(0), Decimal(0)

    async def reserve(self, usd: Decimal) -> Reservation:
        usd = money(usd)
        if self.reserved + self.spent + usd > self.cap:
            raise unavailable("daily_cap")
        self.reserved += usd
        return Reservation(None, usd)

    async def settle(self, reservation, feature, model, input_tokens, output_tokens, cost_usd) -> None:
        self.reserved -= reservation.usd
        self.spent += money(cost_usd)


def load(path: Path = DEFAULT_SET) -> list[dict]:
    return json.loads(Path(path).read_text())


def prompt_for(case: dict) -> tuple[str, str]:
    if case["feature"] == "calibration":
        return calibration_prompt(case["competency"], case["self_view"], case["reviewer_view"],
                                  case.get("comment"), case["narrative"])
    # Numbered as the route numbers them (rubric_lines), level 1 first.
    levels = [{"level_value": n, "descriptor": d} for n, d in enumerate(case["descriptors"], start=1)]
    return coach_prompt(case["competency"], rubric_lines(levels), case["narrative"])


async def run_all(cases: list[dict], gateway) -> list[dict]:
    results = []
    for case in cases:
        system, data = prompt_for(case)
        result = {"id": case["id"], "kind": case["kind"], "watch_for": case.get("watch_for", ""),
                  "asked": [], "kept": [], "dropped": [], "error": None}
        try:
            reply = await gateway.ask(case["feature"], system, data, COACH_SCHEMA, max_tokens=COACH_MAX_TOKENS)
            asked = reply.get("questions", [])
            kept = keep_questions(asked, case["scale_max"], level_names(case["descriptors"]))
            result.update(asked=asked, kept=kept, dropped=[q for q in asked if q.strip() not in kept])
        except AiError as error:
            result["error"] = error.details.get("reason", error.code)
        results.append(result)
    return results


def report(results: list[dict]) -> str:
    out = []
    for r in results:
        out.append(f"\n== {r['id']} ({r['kind']})\n   watch for: {r['watch_for']}")
        if r["error"]:
            out.append(f"   ERROR: {r['error']}")
        for q in r["kept"]:
            out.append(f"   kept     {q}")
        for q in r["dropped"]:
            out.append(f"   dropped  {q}")
    return "\n".join(out)


async def main() -> None:
    from .config import Settings
    from .gateway import ClaudeGateway, client_for

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="also write the results as JSON here")
    args = parser.parse_args()
    settings = Settings()
    if not settings.anthropic_api_key:
        sys.exit("Error: ANTHROPIC_API_KEY is not set. The evals call real Claude (under US$0.05).")
    ledger = Ledger()
    gateway = ClaudeGateway(client_for(settings.anthropic_api_key), ledger, settings.model)
    results = await run_all(load(), gateway)
    print(report(results))
    print(f"\nSpent US${ledger.spent} of the US${CAP_USD} cap on {len(results)} cases.")
    if args.out:
        stamp = datetime.now(UTC).isoformat(timespec="seconds")
        args.out.write_text(json.dumps({"run_at": stamp, "spent_usd": str(ledger.spent), "results": results}, indent=2))
        print(f"Wrote {args.out}")


if __name__ == "__main__":
    asyncio.run(main())
