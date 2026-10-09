from fastapi import APIRouter, Depends

from .caller import Caller, caller
from .deps import Deps, get_deps
from .ranking import rank
from .routes_coach import find_entry, own_reflection
from .vectors import ensure_vectors

LIMIT = 3
EXCERPT = 140


def excerpt(text: str) -> str:
    """One line of the narrative, cut at a word."""
    line = " ".join(text.split())
    if len(line) <= EXCERPT:
        return line
    return line[:EXCERPT].rsplit(" ", 1)[0] + "…"


def register(router: APIRouter) -> None:
    @router.get("/reflections/{reflection_id}/entries/{entry_id}/related")
    async def related(reflection_id: str, entry_id: str, who: Caller = Depends(caller), deps: Deps = Depends(get_deps)) -> dict:
        """The student's own earlier entries that read most like this one. No Claude call."""
        this = await who.reader.reflection(reflection_id)
        own_reflection(this, who.me)
        narrative = (find_entry(this, entry_id).get("narrative") or "").strip()
        await deps.limiter.check(who.token_hash, "search")
        if not narrative:
            return {"entries": []}

        others: dict[str, str] = {}
        about: dict[str, dict] = {}
        for row in await who.reader.reflections():
            if row["id"] == reflection_id:
                continue
            reflection = await who.reader.reflection(row["id"])
            if reflection.get("owner", {}).get("id") != who.me.get("id"):
                continue
            for entry in reflection.get("entries", []):
                text = (entry.get("narrative") or "").strip()
                if text:
                    others[entry["id"]] = text
                    about[entry["id"]] = {
                        "reflection_id": reflection["id"],
                        "entry_id": entry["id"],
                        "sprint_ordinal": reflection.get("sprint_ordinal"),
                        "competency_name": entry.get("competency_name"),
                        "excerpt": excerpt(text),
                    }
        if not others:
            return {"entries": []}

        vectors = await ensure_vectors(deps.store, deps.embedder, {entry_id: narrative, **others})
        ranked = rank(vectors[entry_id], vectors, allowed=others.keys(), k=LIMIT)
        return {"entries": [about[i] for i, _ in ranked]}
