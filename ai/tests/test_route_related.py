from fastapi.testclient import TestClient
from pytest_httpserver import HTTPServer

from sidecar.app import create_app
from sidecar.config import Settings
from sidecar.deps import Deps
from tests.test_vectors import MemoryStore


class WordEmbedder:
    """Deterministic: one dimension per vocabulary word, so overlap ranks."""
    VOCAB = ["blocker", "team", "standup", "import", "bom", "test", "retro", "points"]

    def embed(self, texts):
        return [[float(w in t.lower()) for w in self.VOCAB] for t in texts]


class Limiter:
    def __init__(self):
        self.calls = []

    async def check(self, token_hash, bucket):
        self.calls.append(bucket)


# Laravel's shapes: the detail has no sprint_ordinal (ReflectionDetailResource);
# only the list row does, because only index() loads the sprint.
def reflection(rid, owner, entries, status="assessed", created="2026-08-01T10:00:00.000000Z"):
    return {"id": rid, "status": status, "framework_id": "f1", "created_at": created,
            "owner": {"id": owner, "display_name": "Jane N"},
            "entries": [{"id": eid, "competency_name": name, "narrative": text} for eid, name, text in entries]}


def row(rid, ordinal, created):
    return {"id": rid, "sprint_ordinal": ordinal, "created_at": created}


THIS_CREATED = "2026-08-16T10:00:00.000000Z"
EARLIER_CREATED = "2026-08-01T10:00:00.000000Z"


def laravel(server: HTTPServer, me="u1", earlier=True, later=False):
    server.expect_request("/api/v1/auth/me").respond_with_json({"id": me, "display_name": "X", "participations": []})
    this = reflection("r1", "u1", [("e1", "Communication", "I raised the blocker with my team at standup."),
                                   ("e2", "Agile", "We ran the retro.")], status="draft", created=THIS_CREATED)
    server.expect_request("/api/v1/reflections/r1").respond_with_json(this)
    rows = [row("r1", 2, THIS_CREATED)] + ([row("r0", 1, EARLIER_CREATED)] if earlier else [])
    if later:
        # Written after this one (sprint 3, or another gig's later sprint): not "earlier".
        rows.append(row("r9", 3, "2026-08-30T10:00:00.000000Z"))
        server.expect_request("/api/v1/reflections/r9").respond_with_json(reflection("r9", "u1", [
            ("e90", "Communication", "I raised the blocker with my team at standup again."),
        ], created="2026-08-30T10:00:00.000000Z"))
    server.expect_request("/api/v1/reflections").respond_with_json(rows)
    server.expect_request("/api/v1/reflections/r0").respond_with_json(reflection("r0", "u1", [
        ("e10", "Communication", "I told the team about the blocker in standup."),
        ("e11", "Testing", "The import failed on a BOM so I added a test."),
        ("e12", "Leadership", ""),
    ]))


def call(server: HTTPServer):
    app = create_app(Settings(ai_enabled=True, diary_api_base=server.url_for("/api/v1")))
    limiter = Limiter()
    with TestClient(app) as client:
        app.state.deps = Deps(gateway=None, store=MemoryStore(), embedder=WordEmbedder(), limiter=limiter)
        response = client.get("/ai/v1/reflections/r1/entries/e1/related", headers={"Authorization": "Bearer t"})
    return response, limiter


def test_related_ranks_the_owners_other_reflections_only(httpserver: HTTPServer):
    laravel(httpserver)
    response, _ = call(httpserver)
    entries = response.json()["entries"]
    assert [e["entry_id"] for e in entries][0] == "e10"
    assert {e["reflection_id"] for e in entries} == {"r0"} and len(entries) <= 3
    assert entries[0] == {"reflection_id": "r0", "entry_id": "e10", "sprint_ordinal": 1, "competency_name": "Communication",
                          "excerpt": "I told the team about the blocker in standup."}


def test_related_skips_this_reflection_and_empty_narratives(httpserver: HTTPServer):
    laravel(httpserver)
    ids = {e["entry_id"] for e in call(httpserver)[0].json()["entries"]}
    assert "e2" not in ids and "e12" not in ids


def test_related_is_the_owners_alone(httpserver: HTTPServer):
    laravel(httpserver, me="s1")
    response, _ = call(httpserver)
    assert response.status_code == 403 and response.json()["error"]["code"] == "ROLE_FORBIDDEN"


def test_no_earlier_reflection_is_an_empty_list(httpserver: HTTPServer):
    laravel(httpserver, earlier=False)
    assert call(httpserver)[0].json() == {"entries": []}


def test_related_uses_the_search_rate_limit(httpserver: HTTPServer):
    laravel(httpserver)
    assert call(httpserver)[1].calls == ["search"]


def test_a_student_who_also_assesses_never_sees_another_students_entry(httpserver: HTTPServer):
    # Laravel lists everything on the gigs the caller reviews as well as their own.
    httpserver.expect_request("/api/v1/auth/me").respond_with_json({"id": "u1", "display_name": "X", "participations": []})
    httpserver.expect_request("/api/v1/reflections/r1").respond_with_json(
        reflection("r1", "u1", [("e1", "Communication", "I raised the blocker with my team at standup.")], status="draft", created=THIS_CREATED))
    # r9 is earlier, so only the owner check can keep it out.
    httpserver.expect_request("/api/v1/reflections").respond_with_json(
        [row("r1", 2, THIS_CREATED), row("r9", 1, EARLIER_CREATED)])
    httpserver.expect_request("/api/v1/reflections/r9").respond_with_json(
        reflection("r9", "someone-else", [("e90", "Communication", "I raised the blocker with my team at standup.")]))
    response, _ = call(httpserver)
    assert response.json() == {"entries": []}


def test_a_reflection_written_later_is_not_listed(httpserver: HTTPServer):
    laravel(httpserver, later=True)
    entries = call(httpserver)[0].json()["entries"]
    assert "r9" not in {e["reflection_id"] for e in entries}
    assert entries[0]["entry_id"] == "e10"
