import math
from collections.abc import Iterable


def rank(query: list[float], candidates: dict[str, list[float]], allowed: Iterable[str], k: int) -> list[tuple[str, float]]:
    """Cosine ranking of the candidates the caller may see, best first.

    This is the line between one person's reflections and another's: `allowed`
    is the list of entry ids the caller's own token just got back from Laravel.
    Nothing outside it is ranked, whatever else is in `candidates`."""

    def norm(vector: list[float]) -> float:
        return math.sqrt(sum(x * x for x in vector))

    q = norm(query)
    scored = []
    for entry_id in dict.fromkeys(allowed):
        vector = candidates.get(entry_id)
        if vector is None:
            continue
        n = norm(vector)
        score = 0.0 if q == 0 or n == 0 else sum(a * b for a, b in zip(query, vector)) / (q * n)
        scored.append((entry_id, score))
    return sorted(scored, key=lambda pair: pair[1], reverse=True)[:k]
