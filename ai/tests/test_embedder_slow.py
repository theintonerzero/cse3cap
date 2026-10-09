import pytest

from sidecar.embedder import FastEmbedder


@pytest.mark.slow
def test_bge_small_gives_384_dimensions_and_similar_texts_score_higher():
    embedder = FastEmbedder()
    a, b, c = embedder.embed(
        ["I told the team about the blocker.", "I raised the blocker with my team.", "The import failed on a BOM."]
    )

    def dot(x: list[float], y: list[float]) -> float:
        return sum(p * q for p, q in zip(x, y))

    assert len(a) == 384 and dot(a, b) > dot(a, c)
