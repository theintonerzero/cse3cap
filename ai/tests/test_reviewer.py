import asyncio

from sidecar.errors import AiError
from sidecar.reviewer import details, reviewed_gigs


def test_reviewed_gigs_are_assessor_and_supervisor_gigs():
    me = {"participations": [
        {"gig_id": "g1", "gig_title": "La Trobe", "role": "assessor"},
        {"gig_id": "g2", "gig_title": "SFIA", "role": "supervisor"},
        {"gig_id": "g3", "gig_title": "Employer gig", "role": "employer"},
        {"gig_id": "g4", "gig_title": "Mine", "role": "student"},
    ]}
    assert reviewed_gigs(me) == {"g1": "La Trobe", "g2": "SFIA"}


def test_a_gig_where_the_caller_is_also_a_student_is_not_reviewed():
    me = {"participations": [{"gig_id": "g1", "gig_title": "La Trobe", "role": "assessor"},
                             {"gig_id": "g1", "gig_title": "La Trobe", "role": "student"}]}
    assert reviewed_gigs(me) == {}


class Reader:
    async def reflection(self, rid):
        if rid == "gone":
            raise AiError("NOT_FOUND", 404, "Not found.")
        if rid == "broken":
            raise AiError("AI_UNAVAILABLE", 503, "Upstream.", {"reason": "upstream"})
        return {"id": rid}


def test_details_skips_a_reflection_that_went_away():
    assert asyncio.run(details(Reader(), ["a", "gone", "b"])) == [{"id": "a"}, {"id": "b"}]


def test_details_does_not_hide_an_upstream_failure():
    try:
        asyncio.run(details(Reader(), ["a", "broken"]))
    except AiError as error:
        assert error.status == 503
    else:
        raise AssertionError("expected the 503 to pass through")


def test_a_student_row_is_not_reviewed():
    # The shape Laravel's MeResource sends: one row per gig, its role resolved.
    assert reviewed_gigs({"participations": [{"gig_id": "g1", "gig_title": "La Trobe", "role": "student"}]}) == {}
