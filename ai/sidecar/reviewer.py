import asyncio

from .errors import AiError

REVIEW_ROLES = {"assessor", "supervisor"}
READABLE = {"submitted", "assessed"}  # drafts are the student's working space (spec)


def reviewed_gigs(me: dict) -> dict[str, str]:
    """Gigs the caller assesses or supervises, by Laravel's /auth/me. A student on a
    gig is a student there, whatever else they hold (ADR #47). This narrows what
    Laravel returned; it never grants anything."""
    studying = {p["gig_id"] for p in me.get("participations", []) if p.get("role") == "student"}
    return {p["gig_id"]: p.get("gig_title", "") for p in me.get("participations", [])
            if p.get("role") in REVIEW_ROLES and p["gig_id"] not in studying}


async def details(reader, ids: list[str], limit: int = 5) -> list[dict]:
    """Reflection details, at most `limit` reads at once. One that went away or
    turned private since the list was read is skipped; anything else fails."""
    gate = asyncio.Semaphore(limit)

    async def one(rid: str) -> dict | None:
        async with gate:
            try:
                return await reader.reflection(rid)
            except AiError as error:
                if error.status in (403, 404):
                    return None
                raise

    return [d for d in await asyncio.gather(*(one(rid) for rid in ids)) if d is not None]
