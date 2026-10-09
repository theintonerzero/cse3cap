from fastapi import APIRouter, Depends

from .caller import Caller, caller
from .deps import Deps, get_deps
from .errors import AiError
from .ranking import rank
from .reviewer import READABLE, details, reviewed_gigs
from .routes_related import excerpt
from .vectors import ensure_vectors

LIMIT = 10
MAX_QUERY = 200


def register(router: APIRouter) -> None:
    @router.get("/search")
    async def search(q: str = "", who: Caller = Depends(caller), deps: Deps = Depends(get_deps)) -> dict:
        """Submitted and assessed reflections on the caller's reviewed gigs, by meaning. No Claude call."""
        query = q.strip()
        if not query:
            raise AiError("VALIDATION_FAILED", 400, "Type something to search for.", {"reason": "empty_query"})
        if len(query) > MAX_QUERY:
            raise AiError("VALIDATION_FAILED", 400, "That search is too long.", {"reason": "too_long"})
        gigs = reviewed_gigs(who.me)
        if not gigs:
            raise AiError("ROLE_FORBIDDEN", 403, "Search is for assessors and supervisors.")
        await deps.limiter.check(who.token_hash, "search")

        rows = {r["id"]: r for r in await who.reader.reflections()
                if r.get("status") in READABLE and r.get("gig_id") in gigs}
        texts: dict[str, str] = {}
        about: dict[str, dict] = {}
        for reflection in await details(who.reader, list(rows)):
            # Checked again on the detail: what was listed is not trusted to still hold.
            if (reflection.get("status") not in READABLE or reflection.get("gig_id") not in gigs
                    or reflection.get("owner", {}).get("id") == who.me.get("id")):
                continue
            for entry in reflection.get("entries", []):
                text = (entry.get("narrative") or "").strip()
                if text:
                    texts[entry["id"]] = text
                    about[entry["id"]] = {
                        "reflection_id": reflection["id"], "entry_id": entry["id"],
                        "student_name": reflection.get("owner", {}).get("display_name", ""),
                        "gig_title": gigs[reflection["gig_id"]],
                        "sprint_ordinal": rows[reflection["id"]].get("sprint_ordinal"),
                        "competency_name": entry.get("competency_name"),
                        "excerpt": excerpt(text),
                    }
        if not texts:
            return {"results": []}
        vectors = await ensure_vectors(deps.store, deps.embedder, texts)
        query_vector = deps.embedder.embed([query])[0]  # the query is never stored
        ranked = rank(query_vector, vectors, allowed=texts.keys(), k=LIMIT)
        return {"results": [about[i] for i, _ in ranked]}
