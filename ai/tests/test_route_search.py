from fastapi.testclient import TestClient
from pytest_httpserver import HTTPServer

from sidecar.app import create_app
from sidecar.config import Settings
from sidecar.deps import Deps
from tests.test_route_related import Limiter, WordEmbedder
from tests.test_vectors import MemoryStore

SAM = {"id": "sam", "display_name": "Sam O", "participations": [
    {"gig_id": "g1", "gig_title": "Develop AI use cases", "role": "assessor"}]}


def detail(rid, owner, name, text, status="submitted", gig="g1"):
    return {"id": rid, "status": status, "gig_id": gig, "owner": {"id": owner, "display_name": name},
            "entries": [{"id": f"{rid}-e", "competency_name": "Communication", "narrative": text}]}


def laravel(server: HTTPServer, me=SAM):
    server.expect_request("/api/v1/auth/me").respond_with_json(me)
    rows = [
        {"id": "r1", "status": "submitted", "gig_id": "g1", "sprint_ordinal": 2},
        {"id": "r2", "status": "assessed", "gig_id": "g1", "sprint_ordinal": 1},
        {"id": "r3", "status": "draft", "gig_id": "g1", "sprint_ordinal": 3},
        {"id": "r4", "status": "submitted", "gig_id": "g9", "sprint_ordinal": 1},
        {"id": "r5", "status": "submitted", "gig_id": "g1", "sprint_ordinal": 1},
    ]
    server.expect_request("/api/v1/reflections").respond_with_json(rows)
    for d in (detail("r1", "jane", "Jane N", "I raised the blocker at standup."),
              detail("r2", "priya", "Priya R", "The import failed on a BOM, so I added a test.", "assessed"),
              detail("r3", "tom", "Tom H", "Draft: blocker at standup.", "draft"),
              detail("r4", "zed", "Zed Q", "Blocker at standup on another gig.", gig="g9"),
              detail("r5", "sam", "Sam O", "My own blocker at standup.")):
        server.expect_request(f"/api/v1/reflections/{d['id']}").respond_with_json(d)


def search(server: HTTPServer, q="blocker standup"):
    app = create_app(Settings(ai_enabled=True, diary_api_base=server.url_for("/api/v1")))
    limiter = Limiter()
    with TestClient(app) as client:
        app.state.deps = Deps(gateway=None, store=MemoryStore(), embedder=WordEmbedder(), limiter=limiter)
        response = client.get("/ai/v1/search", params={"q": q}, headers={"Authorization": "Bearer t"})
    return response, limiter


def test_search_ranks_by_meaning_with_the_row_a_reviewer_reads(httpserver: HTTPServer):
    laravel(httpserver)
    response, limiter = search(httpserver)
    results = response.json()["results"]
    assert results[0] == {"reflection_id": "r1", "entry_id": "r1-e", "student_name": "Jane N",
                          "gig_title": "Develop AI use cases", "sprint_ordinal": 2,
                          "competency_name": "Communication", "excerpt": "I raised the blocker at standup."}
    assert limiter.calls == ["search"]


def test_search_ranks_reviewed_submitted_and_assessed_only(httpserver: HTTPServer):
    laravel(httpserver)
    ids = {r["reflection_id"] for r in search(httpserver)[0].json()["results"]}
    assert ids <= {"r1", "r2"}  # never the draft r3, another gig's r4, or Sam's own r5


def test_a_student_cannot_search(httpserver: HTTPServer):
    laravel(httpserver, me={"id": "jane", "display_name": "Jane N", "participations": [
        {"gig_id": "g1", "gig_title": "Develop AI use cases", "role": "student"}]})
    response, _ = search(httpserver)
    assert response.status_code == 403 and response.json()["error"]["code"] == "ROLE_FORBIDDEN"


def test_a_blank_query_is_refused(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me").respond_with_json(SAM)
    response, _ = search(httpserver, q="   ")
    assert response.status_code == 400 and response.json()["error"]["details"] == {"reason": "empty_query"}


def test_a_long_query_is_refused(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me").respond_with_json(SAM)
    response, _ = search(httpserver, q="x" * 201)
    assert response.json()["error"]["details"] == {"reason": "too_long"}
