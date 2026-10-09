from datetime import datetime

from fastapi import APIRouter, Depends

from .caller import Caller, caller
from .deps import Deps, get_deps
from .ranking import rank
from .reviewer import details
from .routes_coach import Id, find_entry, own_reflection
from .vectors import ensure_vectors

LIMIT = 3
EXCERPT = 140


def excerpt(text: str) -> str:
    """One line of the narrative, cut at a word."""
    line = " ".join(text.split())
    if len(line) <= EXCERPT:
        return line
    return line[:EXCERPT].rsplit(" ", 1)[0] + "…"


def written_before(row: dict, this: dict) -> bool:
    """Earlier means written first. Across gigs sprint numbers don't compare, dates do."""
    try:
        return datetime.fromisoformat(row["created_at"]) < datetime.fromisoformat(this["created_at"])
    except (KeyError, TypeError, ValueError):
        return False  # no date to compare: not shown as earlier


def register(router: APIRouter) -> None:
    @router.get("/reflections/{reflection_id}/entries/{entry_id}/related")
    async def related(reflection_id: Id, entry_id: Id, who: Caller = Depends(caller), deps: Deps = Depends(get_deps)) -> dict:
        """The student's own earlier entries that read most like this one. No Claude call."""
        this = await who.reader.reflection(reflection_id)
        own_reflection(this, who.me)
        narrative = (find_entry(this, entry_id).get("narrative") or "").strip()
        await deps.limiter.check(who.token_hash, "search")
        if not narrative:
            return {"entries": []}

        others: dict[str, str] = {}
        about: dict[str, dict] = {}
        rows = {row["id"]: row for row in await who.reader.reflections()
                if row["id"] != reflection_id and written_before(row, this)}
        titles = {p["gig_id"]: p.get("gig_title") for p in who.me.get("participations", [])}
        # Concurrently, and skipping one that went away since the list was read.
        for reflection in await details(who.reader, list(rows)):
            if reflection.get("owner", {}).get("id") != who.me.get("id"):
                continue
            row = rows[reflection["id"]]
            gig = row.get("gig_id")
            for entry in reflection.get("entries", []):
                text = (entry.get("narrative") or "").strip()
                if text:
                    others[entry["id"]] = text
                    about[entry["id"]] = {
                        "reflection_id": reflection["id"],
                        "entry_id": entry["id"],
                        # From the list row: Laravel's detail doesn't carry it.
                        "sprint_ordinal": row.get("sprint_ordinal"),
                        "competency_name": entry.get("competency_name"),
                        "excerpt": excerpt(text),
                        # Named only when it isn't this reflection's gig.
                        "gig_title": titles.get(gig) if gig and gig != this.get("gig_id") else None,
                    }
        if not others:
            return {"entries": []}

        vectors = await ensure_vectors(deps.store, deps.embedder, {entry_id: narrative, **others})
        ranked = rank(vectors[entry_id], vectors, allowed=others.keys(), k=LIMIT)
        return {"entries": [about[i] for i, _ in ranked]}
