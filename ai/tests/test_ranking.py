from sidecar.ranking import rank


def test_rank_never_returns_an_id_outside_allowed():
    candidates = {"mine": [1.0, 0.0], "theirs": [1.0, 0.0], "also-mine": [0.0, 1.0]}
    result = rank([1.0, 0.0], candidates, allowed=["mine", "also-mine"], k=5)
    assert [i for i, _ in result] == ["mine", "also-mine"]


def test_rank_orders_by_cosine_and_stops_at_k():
    candidates = {"a": [1.0, 0.0], "b": [0.7, 0.7], "c": [0.0, 1.0]}
    assert [i for i, _ in rank([1.0, 0.1], candidates, allowed=candidates, k=2)] == ["a", "b"]


def test_a_zero_vector_ranks_last_rather_than_dividing_by_zero():
    assert rank([1.0, 0.0], {"z": [0.0, 0.0], "a": [1.0, 0.0]}, allowed=["z", "a"], k=2)[0][0] == "a"
