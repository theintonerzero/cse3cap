from fastapi import APIRouter, Depends

from .caller import Caller, caller
from .coach import COACH_SCHEMA, coach_prompt, keep_questions, word_count
from .deps import Deps, get_deps
from .errors import AiError, unavailable

MIN_WORDS = 15


def own_reflection(reflection: dict, me: dict) -> None:
    """Coach and related serve the student who owns the reflection. A reviewer may
    read it through Laravel; that is not the same as being coached on it. This
    narrows what Laravel already allowed, it does not decide access."""
    if reflection.get("owner", {}).get("id") != me.get("id"):
        raise AiError("ROLE_FORBIDDEN", 403, "Only the student writing this reflection can use this.")


def find_entry(reflection: dict, entry_id: str) -> dict:
    for entry in reflection.get("entries", []):
        if entry.get("id") == entry_id:
            return entry
    raise AiError("NOT_FOUND", 404, "That competency isn't part of this reflection.")


def register(router: APIRouter) -> None:
    @router.post("/reflections/{reflection_id}/entries/{entry_id}/coach")
    async def coach(reflection_id: str, entry_id: str, who: Caller = Depends(caller), deps: Deps = Depends(get_deps)) -> dict:
        reflection = await who.reader.reflection(reflection_id)
        own_reflection(reflection, who.me)
        if reflection.get("status") != "draft":
            raise AiError("ROLE_FORBIDDEN", 403, "Questions are for a reflection you're still writing.")
        entry = find_entry(reflection, entry_id)
        narrative = entry.get("narrative") or ""
        if word_count(narrative) < MIN_WORDS:
            raise AiError("VALIDATION_FAILED", 400, "Write a few sentences first.", {"reason": "too_short"})

        await deps.limiter.check(who.token_hash, "claude")
        framework = await who.reader.framework(reflection["framework_id"])
        competency = next((c for c in framework.get("competencies", []) if c.get("id") == entry.get("competency_id")), {})
        descriptors = [f"{level['level_value']} · {level['descriptor']}" for level in competency.get("levels", [])]
        system, data = coach_prompt(entry.get("competency_name") or competency.get("name", ""), descriptors, narrative)

        reply = await deps.gateway.ask("coach", system, data, COACH_SCHEMA, max_tokens=2048)
        kept = keep_questions(reply.get("questions", []), framework.get("scale", {}).get("max", 7))
        if not kept:
            raise unavailable("invalid_reply")
        return {"questions": kept}
