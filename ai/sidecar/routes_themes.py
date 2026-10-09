from fastapi import APIRouter, Depends

from .caller import Caller, caller
from .deps import Deps, get_deps
from .errors import AiError, unavailable
from .reviewer import READABLE, details, reviewed_gigs
from .routes_coach import Id
from .themes import MIN_NARRATIVES, THEMES_SCHEMA, keep_themes, themes_prompt, today


def register(router: APIRouter) -> None:
    @router.get("/gigs/{gig_id}/themes")
    async def themes(gig_id: Id, who: Caller = Depends(caller), deps: Deps = Depends(get_deps)) -> dict:
        """Three to five recurring themes across a gig's submitted and assessed reflections.
        Claude is asked once per gig per UTC day; every other request reads the cache."""
        if gig_id not in reviewed_gigs(who.me):
            raise AiError("ROLE_FORBIDDEN", 403, "Themes are for this gig's assessors and supervisors.")
        day = today()
        held = await deps.themes.get(gig_id, day)
        if held is not None:
            return {"themes": held}

        # The Laravel reads count against search; the Claude limit, which the
        # coaches share, only once a call is actually going to be made.
        await deps.limiter.check(who.token_hash, "search")
        rows = [r["id"] for r in await who.reader.reflections(gig_id=gig_id)
                if r.get("status") in READABLE and r.get("gig_id") == gig_id]
        found = [d for d in await details(who.reader, rows)
                 if d.get("status") in READABLE and d.get("gig_id") == gig_id]
        found.sort(key=lambda d: d.get("submitted_at") or "", reverse=True)  # newest first
        narratives = [(e.get("narrative") or "").strip() for d in found for e in d.get("entries", [])]
        narratives = [n for n in narratives if n]
        if len(narratives) < MIN_NARRATIVES:
            return {"themes": []}

        await deps.limiter.check(who.token_hash, "claude")
        system, data = themes_prompt(narratives)
        reply = await deps.gateway.ask("themes", system, data, THEMES_SCHEMA, max_tokens=1024)
        kept = keep_themes(reply.get("themes", []))
        if not kept:
            raise unavailable("invalid_reply")
        await deps.themes.put(gig_id, day, kept)
        return {"themes": kept}
