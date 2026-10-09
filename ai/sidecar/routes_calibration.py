from fastapi import APIRouter, Depends

from .caller import Caller, caller
from .coach import COACH_SCHEMA, calibration_prompt, keep_questions, latest_counter, self_score
from .deps import Deps, get_deps
from .errors import AiError, unavailable
from .routes_coach import find_entry, own_reflection


def register(router: APIRouter) -> None:
    @router.post("/reflections/{reflection_id}/entries/{entry_id}/calibration")
    async def calibration(reflection_id: str, entry_id: str, who: Caller = Depends(caller), deps: Deps = Depends(get_deps)) -> dict:
        """Why might you and your reviewer see this differently? Only after assessment,
        so it can't influence a self-score."""
        reflection = await who.reader.reflection(reflection_id)
        own_reflection(reflection, who.me)
        if reflection.get("status") != "assessed":
            raise AiError("ROLE_FORBIDDEN", 403, "These questions come once the reflection is assessed.")
        entry = find_entry(reflection, entry_id)
        mine, theirs = self_score(entry), latest_counter(entry)
        if not mine or not theirs or mine.get("level_id") == theirs.get("level_id"):
            raise AiError("VALIDATION_FAILED", 400, "You and your reviewer chose the same level here.", {"reason": "no_difference"})

        await deps.limiter.check(who.token_hash, "claude")
        framework = await who.reader.framework(reflection["framework_id"])
        competency = next((c for c in framework.get("competencies", []) if c.get("id") == entry.get("competency_id")), {})
        descriptor = {level["id"]: level["descriptor"] for level in competency.get("levels", [])}
        system, data = calibration_prompt(
            entry.get("competency_name") or competency.get("name", ""),
            descriptor.get(mine["level_id"], ""), descriptor.get(theirs["level_id"], ""),
            theirs.get("comment"), entry.get("narrative") or "",
        )
        reply = await deps.gateway.ask("calibration", system, data, COACH_SCHEMA, max_tokens=2048)
        kept = keep_questions(reply.get("questions", []), framework.get("scale", {}).get("max", 7))
        if not kept:
            raise unavailable("invalid_reply")
        return {"questions": kept}
