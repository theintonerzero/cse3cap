# AI Sidecar Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The sidecar's core in `ai/`: a FastAPI service that is off unless `AI_ENABLED` is set, resolves every caller through Laravel first, reads Laravel with the caller's own token, stores and ranks vectors in its own `diary_ai` database within the ids Laravel returned, and calls Claude only through a gateway that enforces a daily spend cap, rate limits, a timeout and one retry. No feature endpoint yet, only `/ai/v1/status`.

**Architecture:** One Python package, `ai/sidecar/`, one unit per job (spec, "The sidecar, `ai/`"): `DiaryReader` is the only code that calls Laravel, `ClaudeGateway` the only code that calls Claude, `VectorStore` the only code that touches `entry_vectors`. Every route depends on `caller()`, which calls `/auth/me` before anything else. Ranking is a pure function given the caller's allowed ids, so the line between one person's reflections and another's is one tested function. Step 4 adds the four feature endpoints on top of these units; step 5 adds the container and switches it on in the demo.

**Tech Stack:** Python 3.12 (pinned through uv), FastAPI, httpx, aiomysql, fastembed (BAAI/bge-small-en-v1.5, 384 dimensions), anthropic 1.x (`AsyncAnthropic`), pytest with pytest-asyncio and pytest-httpserver, MySQL 9.7 for the store, Redocly for the contract.

**Spec:** `docs/superpowers/specs/2026-10-09-ai-sidecar-and-live-demo-design.md` (sections "The sidecar, `ai/`", "Sidecar API", "Claude", "Errors and limits", "Data in `diary_ai`", "Testing"). Decision record: ADR #64.

## Global Constraints

- Laravel does not change. The sidecar reads `/api/v1` with GET only and forwards the caller's `Authorization` header unchanged.
- Every endpoint resolves the caller through `/auth/me` before anything else; a request without a valid token never reaches Claude or the database.
- `AI_ENABLED` off: every `/ai/v1` route answers `404` with code `AI_DISABLED`.
- Every non-2xx uses the diary's envelope `{ "error": { "code", "message", "details" } }`. Laravel's 401, 403 and 404 pass through with their own code.
- Codes: `UNAUTHENTICATED` 401, `ROLE_FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_FAILED` 400, `AI_DISABLED` 404, `AI_RATE_LIMITED` 429 (`details.retry_after`), `AI_UNAVAILABLE` 503 (`details.reason`: `timeout`, `upstream`, `refusal`, `invalid_reply`, `daily_cap`).
- Model `claude-haiku-5-5`, `output_config.effort` `medium`, structured output, no tools. Timeout 15 s, one retry on 429, 5xx or a connection error.
- Spend cap US$5 per UTC day, reserved at worst case before the call (input tokens counted, `max_tokens` output), settled at actual usage after. Haiku 5.5: US$0.10 per million input tokens, US$0.50 per million output, prompts up to 100K tokens.
- Rate limits: Claude-backed 20 a minute and 200 a day per token; search and related 60 a minute. Keyed by SHA-256 of the token. Tokens are never stored.
- `diary_ai` holds no narrative text, names or emails. `DATETIME(6)` in UTC, never `TIMESTAMP`. No foreign keys to the product database.
- Tests never touch the shared database. Store tests run against a throwaway MySQL named by `AI_TEST_DATABASE_URL` (CI service container, or a local `docker run`), and skip with a message when it is unset.
- snake_case JSON. Plain text output only.

## Review Focus

- A caller whose token Laravel rejects reaches neither Claude nor `diary_ai` (Task 3 test `test_invalid_token_stops_before_anything_else`).
- One student's ranking never includes another student's entry, even when both entries' vectors sit in `entry_vectors` (Task 4 test `test_rank_never_returns_an_id_outside_allowed`).
- A Claude call that would cross the daily cap is refused before the request is made, including when two requests race for the last cents (Task 6 test `test_two_reservations_cannot_both_take_the_last_of_the_cap`).
- Laravel unreachable (connection refused) gives `AI_UNAVAILABLE` with `reason: upstream`, not a 500 with a stack trace (Task 3 test `test_laravel_unreachable_is_ai_unavailable`).
- A Claude reply that is valid JSON but not the schema, or a refusal, never reaches the caller as content (Task 7 tests `test_refusal_is_ai_unavailable_refusal`, `test_reply_outside_schema_is_invalid_reply`).

---

### Task 1: The service, its settings, the envelope and `/ai/v1/status`

**Files:**
- Create: `ai/pyproject.toml`, `ai/.python-version`, `ai/README.md`
- Create: `ai/sidecar/__init__.py`, `ai/sidecar/config.py`, `ai/sidecar/errors.py`, `ai/sidecar/app.py`
- Create: `ai/tests/__init__.py`, `ai/tests/conftest.py`, `ai/tests/test_status.py`
- Modify: `run` (add `ai-test`)

**Interfaces:**
- Produces: `Settings` (pydantic-settings) with `ai_enabled: bool`, `diary_api_base: str`, `database_url: str | None`, `daily_cap_usd: Decimal`, `model: str`; `AiError(code: str, status: int, message: str, details: dict | None = None)`; `create_app(settings: Settings | None = None) -> FastAPI`.

- [ ] **Step 1: Write the failing tests**

```python
# ai/tests/test_status.py
from fastapi.testclient import TestClient
from sidecar.app import create_app
from sidecar.config import Settings

def client(enabled: bool) -> TestClient:
    return TestClient(create_app(Settings(ai_enabled=enabled, diary_api_base="http://diary.invalid/api/v1")))

def test_off_means_every_route_is_ai_disabled():
    response = client(False).get("/ai/v1/status", headers={"Authorization": "Bearer x"})
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "AI_DISABLED", "message": "AI features are switched off.", "details": {}}}

def test_unknown_route_uses_the_envelope():
    response = client(False).get("/ai/v1/nothing-here")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "AI_DISABLED"
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ai && uv run pytest tests/test_status.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'sidecar'`.

- [ ] **Step 3: Write the package**

`ai/.python-version`: `3.12`

```toml
# ai/pyproject.toml
[project]
name = "diary-ai"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = [
  "fastapi>=0.115",
  "uvicorn>=0.32",
  "httpx>=0.28",
  "pydantic-settings>=2.6",
  "aiomysql>=0.2",
  "anthropic>=1,<2",
  "fastembed>=0.4",
]

[dependency-groups]
dev = ["pytest>=8", "pytest-asyncio>=0.24", "pytest-httpserver>=1.1"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
markers = ["slow: loads the real embedding model", "db: needs AI_TEST_DATABASE_URL"]
addopts = "-m 'not slow'"
```

```python
# ai/sidecar/config.py
from decimal import Decimal
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """Read from the environment. Off unless AI_ENABLED is set (ADR #64)."""
    model_config = SettingsConfigDict(env_prefix="", extra="ignore")

    ai_enabled: bool = False
    diary_api_base: str = "http://diary-web/api/v1"
    database_url: str | None = None  # mysql://diary_ai:...@rddb.darkovski.dev:3306/diary_ai
    daily_cap_usd: Decimal = Decimal("5.00")
    model: str = "claude-haiku-5-5"
```

```python
# ai/sidecar/errors.py
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

class AiError(Exception):
    """Every non-2xx the sidecar sends, in the diary's envelope."""
    def __init__(self, code: str, status: int, message: str, details: dict | None = None):
        self.code, self.status, self.message, self.details = code, status, message, details or {}

    def response(self) -> JSONResponse:
        return JSONResponse({"error": {"code": self.code, "message": self.message, "details": self.details}}, status_code=self.status)

DISABLED = AiError("AI_DISABLED", 404, "AI features are switched off.")

def unavailable(reason: str) -> AiError:
    return AiError("AI_UNAVAILABLE", 503, "AI isn't available right now.", {"reason": reason})

def install(app: FastAPI) -> None:
    @app.exception_handler(AiError)
    async def _ai(_: Request, e: AiError):
        return e.response()

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        if e.status_code == 404:
            return DISABLED.response() if not app.state.settings.ai_enabled else AiError("NOT_FOUND", 404, "Not found.").response()
        return AiError("VALIDATION_FAILED", e.status_code, str(e.detail)).response()

    @app.exception_handler(RequestValidationError)
    async def _invalid(_: Request, e: RequestValidationError):
        return AiError("VALIDATION_FAILED", 400, "The request is not valid.", {"errors": e.errors()}).response()
```

```python
# ai/sidecar/app.py
from fastapi import Depends, FastAPI
from . import errors
from .config import Settings

def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    app = FastAPI(title="Reflection Diary AI sidecar", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    errors.install(app)

    def enabled() -> None:
        if not settings.ai_enabled:
            raise errors.DISABLED

    @app.get("/ai/v1/status", dependencies=[Depends(enabled)])
    async def status() -> dict:
        return {"features": []}

    return app
```

`ai/tests/conftest.py` and `ai/tests/__init__.py`: empty files for now.

`ai/README.md`: what the folder is (ADR #64), `uv sync`, `uv run pytest`, `./run ai-test`, how to point `AI_TEST_DATABASE_URL` at a throwaway MySQL (`docker run -d --name diary-ai-test -e MYSQL_ROOT_PASSWORD=test -e MYSQL_DATABASE=diary_ai -p 3307:3306 mysql:9.7`, then `AI_TEST_DATABASE_URL=mysql://root:test@127.0.0.1:3307/diary_ai`), and that it must never be the shared server.

In `run`, beside `test)`:

```bash
    # The AI sidecar's tests (ADR #64). Store tests need AI_TEST_DATABASE_URL,
    # a throwaway MySQL, never the shared one; without it they skip.
    ai-test) in_dir ai uv run pytest ;;
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd ai && uv sync && uv run pytest tests/test_status.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add ai run && git commit -m "feat(ai): the sidecar service, off unless AI_ENABLED (HO-9)"
```

### Task 2: The contract, `docs/ai-openapi.yaml`

**Files:**
- Create: `docs/ai-openapi.yaml`
- Create: `ai/tests/test_contract.py`
- Modify: `.github/workflows/ci.yml` (Contract job: lint the second contract)

**Interfaces:**
- Consumes: `create_app` from Task 1.
- Produces: the contract every later endpoint is added to first; `test_contract.py` fails when a route exists in one and not the other.

- [ ] **Step 1: Write the failing test**

```python
# ai/tests/test_contract.py
from pathlib import Path
import yaml
from sidecar.app import create_app
from sidecar.config import Settings

CONTRACT = Path(__file__).parents[2] / "docs" / "ai-openapi.yaml"

def test_every_route_is_in_the_contract_and_every_contract_path_is_served():
    spec = yaml.safe_load(CONTRACT.read_text())
    declared = {(m.upper(), p) for p, ops in spec["paths"].items() for m in ops if m in {"get", "post"}}
    app = create_app(Settings(ai_enabled=True))
    served = {(m, r.path.removeprefix("/ai/v1")) for r in app.routes for m in getattr(r, "methods", set()) if r.path.startswith("/ai/v1")}
    assert served == declared

def test_the_error_codes_are_the_specs():
    spec = yaml.safe_load(CONTRACT.read_text())
    codes = spec["components"]["schemas"]["Error"]["properties"]["error"]["properties"]["code"]["enum"]
    assert set(codes) == {"UNAUTHENTICATED", "ROLE_FORBIDDEN", "NOT_FOUND", "VALIDATION_FAILED", "AI_DISABLED", "AI_RATE_LIMITED", "AI_UNAVAILABLE"}
```

Add `pyyaml>=6` to the dev dependency group.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ai && uv run pytest tests/test_contract.py -v`
Expected: FAIL, `FileNotFoundError` for `docs/ai-openapi.yaml`.

- [ ] **Step 3: Write the contract**

```yaml
# docs/ai-openapi.yaml
openapi: 3.1.0
info:
  title: Reflection Diary AI sidecar
  version: 0.1.0
  description: >
    The AI sidecar (ADR #64). Off unless AI_ENABLED is set, when every route
    answers 404 AI_DISABLED. Every request is resolved through the diary's
    /auth/me first, with the caller's own bearer token. It never writes to the
    diary. Same envelope and snake_case as docs/openapi.yaml.
  license: { name: Proprietary, identifier: LicenseRef-Proprietary }
servers:
  - url: /ai/v1
security:
  - bearer: []
paths:
  /status:
    get:
      operationId: getStatus
      summary: Which AI features are on.
      responses:
        "200":
          description: On.
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Status" }
        "401": { $ref: "#/components/responses/Error" }
        "404": { $ref: "#/components/responses/Error" }
        "503": { $ref: "#/components/responses/Error" }
components:
  securitySchemes:
    bearer: { type: http, scheme: bearer }
  responses:
    Error:
      description: The envelope.
      content:
        application/json:
          schema: { $ref: "#/components/schemas/Error" }
  schemas:
    Status:
      type: object
      required: [features]
      properties:
        features:
          type: array
          items: { type: string, enum: [coach, related, calibration, search, themes] }
    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message, details]
          properties:
            code:
              type: string
              enum: [UNAUTHENTICATED, ROLE_FORBIDDEN, NOT_FOUND, VALIDATION_FAILED, AI_DISABLED, AI_RATE_LIMITED, AI_UNAVAILABLE]
            message: { type: string }
            details:
              type: object
              description: "AI_RATE_LIMITED: retry_after (seconds). AI_UNAVAILABLE: reason, one of timeout, upstream, refusal, invalid_reply, daily_cap."
```

In `.github/workflows/ci.yml`, Contract job, after "Lint the OpenAPI contract":

```yaml
      - name: Lint the AI sidecar's contract (ADR #64)
        run: npx -y @redocly/cli@latest lint docs/ai-openapi.yaml
```

- [ ] **Step 4: Run it and watch it pass; lint it**

Run: `cd ai && uv run pytest tests/test_contract.py -v && cd .. && npx -y @redocly/cli@latest lint docs/ai-openapi.yaml`
Expected: 2 passed; Redocly "Your API description is valid".

- [ ] **Step 5: Commit**

```bash
git add docs/ai-openapi.yaml ai .github/workflows/ci.yml && git commit -m "docs: the AI sidecar's contract, docs/ai-openapi.yaml (HO-9)"
```

### Task 3: `DiaryReader` and the caller, resolved first

**Files:**
- Create: `ai/sidecar/reader.py`, `ai/sidecar/caller.py`
- Create: `ai/tests/test_reader.py`, `ai/tests/test_caller.py`
- Modify: `ai/sidecar/app.py` (status depends on the caller)

**Interfaces:**
- Consumes: `AiError`, `unavailable`, `Settings`.
- Produces: `DiaryReader(base_url: str, authorization: str, client: httpx.AsyncClient)` with `async me() -> dict`, `async reflections(**query) -> list[dict]`, `async reflection(reflection_id: str) -> dict`, `async framework(framework_id: str) -> dict`, `async get(path: str, **query) -> Any`; `Caller(me: dict, reader: DiaryReader, token_hash: str)`; FastAPI dependency `caller(request) -> Caller`.

- [ ] **Step 1: Write the failing tests**

```python
# ai/tests/test_reader.py
import httpx, pytest
from pytest_httpserver import HTTPServer
from sidecar.errors import AiError
from sidecar.reader import DiaryReader

def reader(server: HTTPServer, token="Bearer t") -> DiaryReader:
    return DiaryReader(server.url_for("/api/v1"), token, httpx.AsyncClient(timeout=5))

async def test_forwards_the_callers_token_unchanged_and_only_gets(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me", method="GET", headers={"Authorization": "Bearer t"}).respond_with_json({"id": "u1", "display_name": "Jane N", "participations": []})
    assert (await reader(httpserver).me())["id"] == "u1"

@pytest.mark.parametrize("status,code", [(401, "UNAUTHENTICATED"), (403, "ROLE_FORBIDDEN"), (404, "NOT_FOUND")])
async def test_laravel_refusals_pass_through_with_their_code(httpserver: HTTPServer, status, code):
    httpserver.expect_request("/api/v1/reflections/r1").respond_with_json({"error": {"code": code, "message": "m", "details": {}}}, status=status)
    with pytest.raises(AiError) as e:
        await reader(httpserver).reflection("r1")
    assert (e.value.status, e.value.code, e.value.message) == (status, code, "m")

async def test_laravel_unreachable_is_ai_unavailable():
    r = DiaryReader("http://127.0.0.1:9/api/v1", "Bearer t", httpx.AsyncClient(timeout=1))
    with pytest.raises(AiError) as e:
        await r.me()
    assert (e.value.code, e.value.details) == ("AI_UNAVAILABLE", {"reason": "upstream"})

async def test_a_laravel_500_is_ai_unavailable_not_passed_through(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me").respond_with_data("boom", status=500)
    with pytest.raises(AiError) as e:
        await reader(httpserver).me()
    assert e.value.code == "AI_UNAVAILABLE"
```

```python
# ai/tests/test_caller.py
from fastapi.testclient import TestClient
from pytest_httpserver import HTTPServer
from sidecar.app import create_app
from sidecar.config import Settings

def test_invalid_token_stops_before_anything_else(httpserver: HTTPServer):
    httpserver.expect_ordered_request("/api/v1/auth/me").respond_with_json({"error": {"code": "UNAUTHENTICATED", "message": "No.", "details": {}}}, status=401)
    app = create_app(Settings(ai_enabled=True, diary_api_base=httpserver.url_for("/api/v1")))
    response = TestClient(app).get("/ai/v1/status", headers={"Authorization": "Bearer bad"})
    assert response.status_code == 401 and response.json()["error"]["code"] == "UNAUTHENTICATED"
    assert len(httpserver.log) == 1  # /auth/me, and nothing after it

def test_no_authorization_header_is_unauthenticated_without_calling_laravel(httpserver: HTTPServer):
    app = create_app(Settings(ai_enabled=True, diary_api_base=httpserver.url_for("/api/v1")))
    response = TestClient(app).get("/ai/v1/status")
    assert response.status_code == 401 and response.json()["error"]["code"] == "UNAUTHENTICATED"
    assert httpserver.log == []

def test_a_valid_token_reaches_status(httpserver: HTTPServer):
    httpserver.expect_request("/api/v1/auth/me").respond_with_json({"id": "u1", "display_name": "Jane N", "participations": []})
    app = create_app(Settings(ai_enabled=True, diary_api_base=httpserver.url_for("/api/v1")))
    assert TestClient(app).get("/ai/v1/status", headers={"Authorization": "Bearer t"}).json() == {"features": []}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ai && uv run pytest tests/test_reader.py tests/test_caller.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'sidecar.reader'`.

- [ ] **Step 3: Write the reader and the caller**

```python
# ai/sidecar/reader.py
from typing import Any
import httpx
from .errors import AiError, unavailable

PASSED_THROUGH = {401, 403, 404}

class DiaryReader:
    """The only code that calls Laravel. GET only, with the caller's own token.

    It never sees or infers a role: Laravel decides what this token may read,
    and its 401, 403 and 404 reach the caller unchanged."""

    def __init__(self, base_url: str, authorization: str, client: httpx.AsyncClient):
        self._base = base_url.rstrip("/")
        self._headers = {"Authorization": authorization, "Accept": "application/json"}
        self._client = client

    async def get(self, path: str, **query: Any) -> Any:
        try:
            response = await self._client.get(f"{self._base}{path}", headers=self._headers, params={k: v for k, v in query.items() if v is not None})
        except httpx.HTTPError:
            raise unavailable("upstream")
        if response.status_code in PASSED_THROUGH:
            try:
                error = response.json()["error"]
                raise AiError(error["code"], response.status_code, error["message"], error.get("details") or {})
            except (ValueError, KeyError, TypeError):
                raise unavailable("upstream")
        if response.status_code != 200:
            raise unavailable("upstream")
        return response.json()

    async def me(self) -> dict:
        return await self.get("/auth/me")

    async def reflections(self, **query: Any) -> list[dict]:
        return await self.get("/reflections", **query)

    async def reflection(self, reflection_id: str) -> dict:
        return await self.get(f"/reflections/{reflection_id}")

    async def framework(self, framework_id: str) -> dict:
        return await self.get(f"/frameworks/{framework_id}")
```

```python
# ai/sidecar/caller.py
import hashlib
from dataclasses import dataclass
from fastapi import Request
from .errors import AiError
from .reader import DiaryReader

@dataclass(frozen=True)
class Caller:
    me: dict
    reader: DiaryReader
    token_hash: str  # SHA-256 of the token, for rate limits. The token itself is never kept.

async def caller(request: Request) -> Caller:
    """Runs before every route body: no valid token, nothing else happens."""
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer ") or len(authorization) <= len("Bearer "):
        raise AiError("UNAUTHENTICATED", 401, "Sign in to use this.")
    reader = DiaryReader(request.app.state.settings.diary_api_base, authorization, request.app.state.http)
    me = await reader.me()
    return Caller(me=me, reader=reader, token_hash=hashlib.sha256(authorization.encode()).hexdigest())
```

In `ai/sidecar/app.py`: create one shared `httpx.AsyncClient(timeout=10)` in a lifespan and set `app.state.http`; give `/ai/v1/status` both dependencies, `enabled` first:

```python
from contextlib import asynccontextmanager
import httpx
from .caller import Caller, caller
...
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.http = httpx.AsyncClient(timeout=10)
        yield
        await app.state.http.aclose()
    app = FastAPI(..., lifespan=lifespan)
...
    @app.get("/ai/v1/status", dependencies=[Depends(enabled)])
    async def status(_: Caller = Depends(caller)) -> dict:
        return {"features": []}
```

`TestClient` must be used as a context manager for the lifespan to run: change the tests' `TestClient(app)` to `with TestClient(app) as c:` blocks.

- [ ] **Step 4: Run them and watch them pass**

Run: `cd ai && uv run pytest -v`
Expected: all passed (status, contract, reader, caller).

- [ ] **Step 5: Commit**

```bash
git add ai && git commit -m "feat(ai): DiaryReader, and every request resolves the caller first (HO-9)"
```

### Task 4: `diary_ai`, `VectorStore` and the scoping rule

**Files:**
- Create: `ai/db/01-schema.sql`, `ai/sidecar/db.py`, `ai/sidecar/store.py`, `ai/sidecar/ranking.py`
- Create: `ai/tests/test_ranking.py`, `ai/tests/test_store.py`
- Modify: `ai/tests/conftest.py` (a `db` fixture)

**Interfaces:**
- Produces: `rank(query: list[float], candidates: dict[str, list[float]], allowed: Iterable[str], k: int) -> list[tuple[str, float]]`; `VectorStore(pool)` with `async vectors(entry_ids: Sequence[str]) -> dict[str, tuple[str, list[float]]]` (`entry_id -> (content_hash, vector)`) and `async put(entry_id: str, content_hash: str, vector: list[float]) -> None`; `async connect(url: str) -> aiomysql.Pool`.

- [ ] **Step 1: Write the failing tests**

```python
# ai/tests/test_ranking.py
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
```

```python
# ai/tests/test_store.py
import pytest
from sidecar.store import VectorStore

pytestmark = pytest.mark.db

async def test_vectors_returns_only_the_ids_asked_for(db):
    store = VectorStore(db)
    await store.put("mine", "h1", [0.1] * 384)
    await store.put("theirs", "h2", [0.2] * 384)
    found = await store.vectors(["mine", "absent"])
    assert set(found) == {"mine"}
    assert found["mine"][0] == "h1" and len(found["mine"][1]) == 384

async def test_put_replaces_a_changed_narratives_vector(db):
    store = VectorStore(db)
    await store.put("e", "old", [0.1] * 384)
    await store.put("e", "new", [0.3] * 384)
    assert (await store.vectors(["e"]))["e"][0] == "new"

async def test_no_ids_is_no_query(db):
    assert await VectorStore(db).vectors([]) == {}
```

In `ai/tests/conftest.py`:

```python
import os
from pathlib import Path
import pytest
from sidecar.db import connect

SCHEMA = Path(__file__).parents[1] / "db" / "01-schema.sql"

@pytest.fixture
async def db():
    url = os.environ.get("AI_TEST_DATABASE_URL")
    if not url:
        pytest.skip("AI_TEST_DATABASE_URL is unset: point it at a throwaway MySQL, never the shared one (ai/README.md)")
    if "rddb.darkovski.dev" in url:
        pytest.fail("AI_TEST_DATABASE_URL names the shared server. The tests drop tables.")
    pool = await connect(url)
    async with pool.acquire() as conn, conn.cursor() as cur:
        for table in ("entry_vectors", "usage_log", "spend_days", "theme_cache", "rate_limits"):
            await cur.execute(f"DROP TABLE IF EXISTS {table}")
        for statement in filter(str.strip, SCHEMA.read_text().split(";")):
            await cur.execute(statement)
    yield pool
    pool.close()
    await pool.wait_closed()
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ai && uv run pytest tests/test_ranking.py tests/test_store.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'sidecar.ranking'`.

- [ ] **Step 3: Write the schema, the pool, the store and the ranking**

```sql
-- ai/db/01-schema.sql
-- The sidecar's own database, diary_ai (ADR #64). No narrative text, names or
-- emails. No foreign keys: the product database is another database, and an
-- entry id here is only ever ranked if Laravel just returned it for the caller.
-- DATETIME(6) in UTC, never TIMESTAMP.
CREATE TABLE entry_vectors (
  entry_id     CHAR(36)    NOT NULL PRIMARY KEY,
  content_hash CHAR(64)    NOT NULL,
  embedding    VECTOR(384) NOT NULL,
  created_at   DATETIME(6) NOT NULL
);
CREATE TABLE usage_log (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  feature       VARCHAR(32)     NOT NULL,
  model         VARCHAR(64)     NOT NULL,
  input_tokens  INT UNSIGNED    NOT NULL,
  output_tokens INT UNSIGNED    NOT NULL,
  cost_usd      DECIMAL(12,6)   NOT NULL,
  created_at    DATETIME(6)     NOT NULL
);
CREATE TABLE spend_days (
  day          DATE          NOT NULL PRIMARY KEY,
  reserved_usd DECIMAL(12,6) NOT NULL DEFAULT 0,
  spent_usd    DECIMAL(12,6) NOT NULL DEFAULT 0
);
CREATE TABLE theme_cache (
  gig_id     CHAR(36)    NOT NULL,
  day        DATE        NOT NULL,
  themes     JSON        NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (gig_id, day)
);
CREATE TABLE rate_limits (
  token_hash   CHAR(64)    NOT NULL,
  bucket       VARCHAR(32) NOT NULL,
  window_start DATETIME(6) NOT NULL,
  hits         INT UNSIGNED NOT NULL,
  PRIMARY KEY (token_hash, bucket, window_start)
)
```

```python
# ai/sidecar/db.py
from urllib.parse import urlparse
import aiomysql

async def connect(url: str) -> aiomysql.Pool:
    """A pool on diary_ai. TLS is the caller's: the deploy passes ssl in step 5."""
    u = urlparse(url)
    return await aiomysql.create_pool(host=u.hostname, port=u.port or 3306, user=u.username, password=u.password or "",
                                      db=u.path.lstrip("/"), autocommit=True, minsize=1, maxsize=5)
```

```python
# ai/sidecar/ranking.py
import math
from collections.abc import Iterable

def rank(query: list[float], candidates: dict[str, list[float]], allowed: Iterable[str], k: int) -> list[tuple[str, float]]:
    """Cosine ranking of the candidates the caller may see, best first.

    The security line between users: `allowed` is the list of entry ids the
    caller's own token just got back from Laravel. Nothing outside it is ranked,
    whatever else is in `candidates`."""
    def norm(v: list[float]) -> float:
        return math.sqrt(sum(x * x for x in v))
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
```

```python
# ai/sidecar/store.py
import json
from collections.abc import Sequence
from datetime import UTC, datetime
import aiomysql

class VectorStore:
    """The only code that touches entry_vectors. MySQL stores, Python ranks:
    MySQL 9.7 Community has no DISTANCE (ADR #64)."""

    def __init__(self, pool: aiomysql.Pool):
        self._pool = pool

    async def vectors(self, entry_ids: Sequence[str]) -> dict[str, tuple[str, list[float]]]:
        if not entry_ids:
            return {}
        marks = ",".join(["%s"] * len(entry_ids))
        async with self._pool.acquire() as conn, conn.cursor() as cur:
            await cur.execute(f"SELECT entry_id, content_hash, VECTOR_TO_STRING(embedding) FROM entry_vectors WHERE entry_id IN ({marks})", list(entry_ids))
            return {row[0]: (row[1], json.loads(row[2])) for row in await cur.fetchall()}

    async def put(self, entry_id: str, content_hash: str, vector: list[float]) -> None:
        async with self._pool.acquire() as conn, conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO entry_vectors (entry_id, content_hash, embedding, created_at) VALUES (%s, %s, STRING_TO_VECTOR(%s), %s) "
                "ON DUPLICATE KEY UPDATE content_hash = VALUES(content_hash), embedding = VALUES(embedding), created_at = VALUES(created_at)",
                (entry_id, content_hash, json.dumps(vector), datetime.now(UTC).replace(tzinfo=None)),
            )
```

- [ ] **Step 4: Run them and watch them pass**

Run: `docker run -d --name diary-ai-test -e MYSQL_ROOT_PASSWORD=test -e MYSQL_DATABASE=diary_ai -p 3307:3306 mysql:9.7` (once; wait for it to accept connections), then `cd ai && AI_TEST_DATABASE_URL=mysql://root:test@127.0.0.1:3307/diary_ai uv run pytest tests/test_ranking.py tests/test_store.py -v`
Expected: 6 passed. Without the variable: 3 passed, 3 skipped with the message.

- [ ] **Step 5: Commit**

```bash
git add ai && git commit -m "feat(ai): diary_ai, VectorStore, and ranking only within the caller's ids (HO-9)"
```

### Task 5: The `Embedder` and lazy vectors

**Files:**
- Create: `ai/sidecar/embedder.py`, `ai/sidecar/vectors.py`
- Create: `ai/tests/test_vectors.py`, `ai/tests/test_embedder_slow.py`

**Interfaces:**
- Consumes: `VectorStore` from Task 4.
- Produces: `Embedder` protocol with `embed(texts: list[str]) -> list[list[float]]`; `FastEmbedder()` (bge-small, 384); `content_hash(text: str) -> str`; `async ensure_vectors(store: VectorStore, embedder: Embedder, entries: dict[str, str]) -> dict[str, list[float]]` (`entry_id -> narrative` in, `entry_id -> vector` out, embedding only what is missing or changed).

- [ ] **Step 1: Write the failing tests**

```python
# ai/tests/test_vectors.py
import pytest
from sidecar.vectors import content_hash, ensure_vectors

class CountingEmbedder:
    def __init__(self):
        self.seen: list[str] = []
    def embed(self, texts: list[str]) -> list[list[float]]:
        self.seen += texts
        return [[float(len(t))] + [0.0] * 383 for t in texts]

class MemoryStore:
    def __init__(self):
        self.rows: dict[str, tuple[str, list[float]]] = {}
    async def vectors(self, ids):
        return {i: self.rows[i] for i in ids if i in self.rows}
    async def put(self, i, h, v):
        self.rows[i] = (h, v)

async def test_embeds_only_what_is_missing_or_changed():
    store, embedder = MemoryStore(), CountingEmbedder()
    store.rows["same"] = (content_hash("kept"), [9.0] + [0.0] * 383)
    store.rows["edited"] = (content_hash("before"), [9.0] + [0.0] * 383)
    out = await ensure_vectors(store, embedder, {"same": "kept", "edited": "after", "new": "fresh text"})
    assert sorted(embedder.seen) == ["after", "fresh text"]
    assert out["same"][0] == 9.0 and out["edited"][0] == 5.0

async def test_empty_narratives_are_not_embedded():
    embedder = CountingEmbedder()
    assert await ensure_vectors(MemoryStore(), embedder, {"e": "   "}) == {}
    assert embedder.seen == []
```

```python
# ai/tests/test_embedder_slow.py
import pytest
from sidecar.embedder import FastEmbedder

@pytest.mark.slow
def test_bge_small_gives_384_dimensions_and_similar_texts_score_higher():
    e = FastEmbedder()
    a, b, c = e.embed(["I told the team about the blocker.", "I raised the blocker with my team.", "The import failed on a BOM."])
    dot = lambda x, y: sum(p * q for p, q in zip(x, y))
    assert len(a) == 384 and dot(a, b) > dot(a, c)
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ai && uv run pytest tests/test_vectors.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'sidecar.vectors'`.

- [ ] **Step 3: Write the embedder and `ensure_vectors`**

```python
# ai/sidecar/embedder.py
from typing import Protocol

class Embedder(Protocol):
    def embed(self, texts: list[str]) -> list[list[float]]: ...

class FastEmbedder:
    """bge-small-en-v1.5, 384 dimensions, on the box's CPU (ADR #64: the Claude
    API has no embeddings model). Loaded once; the first call after a start waits."""
    MODEL = "BAAI/bge-small-en-v1.5"

    def __init__(self):
        from fastembed import TextEmbedding
        self._model = TextEmbedding(model_name=self.MODEL)

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [vector.tolist() for vector in self._model.embed(texts)]
```

```python
# ai/sidecar/vectors.py
import asyncio
import hashlib
from .embedder import Embedder

def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()

async def ensure_vectors(store, embedder: Embedder, entries: dict[str, str]) -> dict[str, list[float]]:
    """Vectors for these entries, embedding lazily: only a narrative not stored,
    or stored under a different hash, is embedded now. Nothing runs in the background."""
    texts = {i: t for i, t in entries.items() if t and t.strip()}
    stored = await store.vectors(list(texts))
    stale = [i for i, t in texts.items() if stored.get(i, ("", []))[0] != content_hash(t)]
    fresh = await asyncio.to_thread(embedder.embed, [texts[i] for i in stale]) if stale else []
    for entry_id, vector in zip(stale, fresh):
        await store.put(entry_id, content_hash(texts[entry_id]), vector)
    return {i: stored[i][1] for i in texts if i not in stale} | dict(zip(stale, fresh))
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd ai && uv run pytest tests/test_vectors.py -v && uv run pytest -m slow tests/test_embedder_slow.py -v`
Expected: 2 passed; the slow test downloads the model once and passes.

- [ ] **Step 5: Commit**

```bash
git add ai && git commit -m "feat(ai): bge-small embeddings, computed lazily per narrative (HO-9)"
```

### Task 6: `SpendLedger` and `RateLimiter`

**Files:**
- Create: `ai/sidecar/spend.py`, `ai/sidecar/limits.py`
- Create: `ai/tests/test_spend.py`, `ai/tests/test_limits.py`

**Interfaces:**
- Produces: `SpendLedger(pool, cap_usd: Decimal)` with `async reserve(usd: Decimal) -> Reservation` (raises `unavailable("daily_cap")`) and `async settle(reservation: Reservation, feature: str, model: str, input_tokens: int, output_tokens: int, cost_usd: Decimal) -> None`; `RateLimiter(pool)` with `async hit(token_hash: str, bucket: str, limit: int, window: timedelta) -> None` (raises `AiError("AI_RATE_LIMITED", 429, ..., {"retry_after": seconds})`); `LIMITS = {"claude": [(20, timedelta(minutes=1)), (200, timedelta(days=1))], "search": [(60, timedelta(minutes=1))]}`.

- [ ] **Step 1: Write the failing tests**

```python
# ai/tests/test_spend.py
import asyncio
from decimal import Decimal
import pytest
from sidecar.errors import AiError
from sidecar.spend import SpendLedger

pytestmark = pytest.mark.db

async def test_a_call_that_would_cross_the_cap_is_refused(db):
    ledger = SpendLedger(db, Decimal("0.010"))
    await ledger.reserve(Decimal("0.008"))
    with pytest.raises(AiError) as e:
        await ledger.reserve(Decimal("0.003"))
    assert (e.value.code, e.value.details) == ("AI_UNAVAILABLE", {"reason": "daily_cap"})

async def test_settling_releases_the_reservation_and_records_the_actual(db):
    ledger = SpendLedger(db, Decimal("0.010"))
    r = await ledger.reserve(Decimal("0.008"))
    await ledger.settle(r, "coach", "claude-haiku-5-5", 1200, 300, Decimal("0.000270"))
    await ledger.reserve(Decimal("0.009"))  # fits now: 0.00027 spent, nothing else reserved

async def test_two_reservations_cannot_both_take_the_last_of_the_cap(db):
    ledger = SpendLedger(db, Decimal("0.010"))
    results = await asyncio.gather(ledger.reserve(Decimal("0.006")), ledger.reserve(Decimal("0.006")), return_exceptions=True)
    assert sum(isinstance(r, AiError) for r in results) == 1
```

```python
# ai/tests/test_limits.py
from datetime import timedelta
import pytest
from sidecar.errors import AiError
from sidecar.limits import RateLimiter

pytestmark = pytest.mark.db

async def test_the_limit_plus_one_is_refused_with_retry_after(db):
    limiter = RateLimiter(db)
    for _ in range(3):
        await limiter.hit("h" * 64, "claude", 3, timedelta(minutes=1))
    with pytest.raises(AiError) as e:
        await limiter.hit("h" * 64, "claude", 3, timedelta(minutes=1))
    assert e.value.code == "AI_RATE_LIMITED" and 0 < e.value.details["retry_after"] <= 60

async def test_tokens_are_counted_apart(db):
    limiter = RateLimiter(db)
    await limiter.hit("a" * 64, "claude", 1, timedelta(minutes=1))
    await limiter.hit("b" * 64, "claude", 1, timedelta(minutes=1))
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ai && AI_TEST_DATABASE_URL=mysql://root:test@127.0.0.1:3307/diary_ai uv run pytest tests/test_spend.py tests/test_limits.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'sidecar.spend'`.

- [ ] **Step 3: Write the ledger and the limiter**

```python
# ai/sidecar/spend.py
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from .errors import unavailable

@dataclass(frozen=True)
class Reservation:
    day: date
    usd: Decimal

class SpendLedger:
    """The US$ per UTC day cap (ADR #64). A call reserves its worst case before it
    is made and settles its real cost after. The day's row is locked while a
    reservation is checked, so two calls can't both take the last of the cap."""

    def __init__(self, pool, cap_usd: Decimal):
        self._pool, self._cap = pool, cap_usd

    async def reserve(self, usd: Decimal) -> Reservation:
        today = datetime.now(UTC).date()
        async with self._pool.acquire() as conn:
            await conn.begin()
            try:
                async with conn.cursor() as cur:
                    await cur.execute("INSERT IGNORE INTO spend_days (day) VALUES (%s)", (today,))
                    await cur.execute("SELECT reserved_usd + spent_usd FROM spend_days WHERE day = %s FOR UPDATE", (today,))
                    (committed,) = await cur.fetchone()
                    if committed + usd > self._cap:
                        await conn.rollback()
                        raise unavailable("daily_cap")
                    await cur.execute("UPDATE spend_days SET reserved_usd = reserved_usd + %s WHERE day = %s", (usd, today))
                await conn.commit()
            except Exception:
                await conn.rollback()
                raise
        return Reservation(today, usd)

    async def settle(self, reservation: Reservation, feature: str, model: str, input_tokens: int, output_tokens: int, cost_usd: Decimal) -> None:
        async with self._pool.acquire() as conn, conn.cursor() as cur:
            await cur.execute("UPDATE spend_days SET reserved_usd = reserved_usd - %s, spent_usd = spent_usd + %s WHERE day = %s",
                              (reservation.usd, cost_usd, reservation.day))
            await cur.execute("INSERT INTO usage_log (feature, model, input_tokens, output_tokens, cost_usd, created_at) VALUES (%s, %s, %s, %s, %s, %s)",
                              (feature, model, input_tokens, output_tokens, cost_usd, datetime.now(UTC).replace(tzinfo=None)))
```

`connect` in `db.py` uses `autocommit=True`; `conn.begin()` starts an explicit transaction for the reservation.

```python
# ai/sidecar/limits.py
from datetime import UTC, datetime, timedelta
from .errors import AiError

LIMITS = {
    "claude": [(20, timedelta(minutes=1)), (200, timedelta(days=1))],
    "search": [(60, timedelta(minutes=1))],
}

class RateLimiter:
    """Fixed windows per SHA-256 of the token. The token is never stored."""

    def __init__(self, pool):
        self._pool = pool

    async def hit(self, token_hash: str, bucket: str, limit: int, window: timedelta) -> None:
        now = datetime.now(UTC).replace(tzinfo=None)
        seconds = window.total_seconds()
        start = datetime.fromtimestamp((now.replace(tzinfo=UTC).timestamp() // seconds) * seconds, UTC).replace(tzinfo=None)
        key = f"{bucket}:{int(window.total_seconds())}"
        async with self._pool.acquire() as conn, conn.cursor() as cur:
            await cur.execute("INSERT INTO rate_limits (token_hash, bucket, window_start, hits) VALUES (%s, %s, %s, 1) "
                              "ON DUPLICATE KEY UPDATE hits = hits + 1", (token_hash, key, start))
            await cur.execute("SELECT hits FROM rate_limits WHERE token_hash = %s AND bucket = %s AND window_start = %s", (token_hash, key, start))
            (hits,) = await cur.fetchone()
        if hits > limit:
            retry_after = max(1, int((start + window - now).total_seconds()))
            raise AiError("AI_RATE_LIMITED", 429, "Too many requests. Try again shortly.", {"retry_after": retry_after})

    async def check(self, token_hash: str, bucket: str) -> None:
        for limit, window in LIMITS[bucket]:
            await self.hit(token_hash, bucket, limit, window)
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd ai && AI_TEST_DATABASE_URL=mysql://root:test@127.0.0.1:3307/diary_ai uv run pytest tests/test_spend.py tests/test_limits.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add ai && git commit -m "feat(ai): the daily spend cap and per-token rate limits (HO-9)"
```

### Task 7: `ClaudeGateway`

**Files:**
- Create: `ai/sidecar/gateway.py`
- Create: `ai/tests/test_gateway.py`

**Interfaces:**
- Consumes: `SpendLedger`, `Reservation`, `unavailable` from earlier tasks.
- Produces: `ClaudeGateway(client: anthropic.AsyncAnthropic, ledger: SpendLedger, model: str = "claude-haiku-5-5")` with `async ask(feature: str, system: str, data: str, schema: dict, max_tokens: int = 2048) -> dict`; `PRICE_IN = Decimal("0.10") / 1_000_000`, `PRICE_OUT = Decimal("0.50") / 1_000_000`; `client_for(api_key: str | None, base_url: str | None = None) -> AsyncAnthropic` (timeout 15 s, `max_retries=1`).

The gateway's tests drive the real SDK against a local fake of the Messages API (pytest-httpserver), so retries, timeouts and status codes are the SDK's own behaviour, not a mock of it. The ledger in these tests is an in-memory fake with the same two methods.

- [ ] **Step 1: Write the failing tests**

```python
# ai/tests/test_gateway.py
import json
from decimal import Decimal
import pytest
from pytest_httpserver import HTTPServer
from sidecar.errors import AiError
from sidecar.gateway import ClaudeGateway, client_for
from sidecar.spend import Reservation

SCHEMA = {"type": "object", "properties": {"questions": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3}},
          "required": ["questions"], "additionalProperties": False}

class Ledger:
    def __init__(self, refuse=False):
        self.refuse, self.reserved, self.settled = refuse, [], []
    async def reserve(self, usd):
        if self.refuse:
            raise AiError("AI_UNAVAILABLE", 503, "x", {"reason": "daily_cap"})
        self.reserved.append(usd)
        return Reservation(None, usd)
    async def settle(self, r, feature, model, i, o, cost):
        self.settled.append((feature, model, i, o, cost))

def message(text: str, stop="end_turn", input_tokens=1000, output_tokens=200):
    return {"id": "m", "type": "message", "role": "assistant", "model": "claude-haiku-5-5", "stop_reason": stop, "stop_sequence": None,
            "content": [{"type": "text", "text": text}], "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens}}

def gateway(server: HTTPServer, ledger: Ledger) -> ClaudeGateway:
    server.expect_request("/v1/messages/count_tokens").respond_with_json({"input_tokens": 1000})
    return ClaudeGateway(client_for("test-key", server.url_for("").rstrip("/")), ledger)

async def test_reserves_the_worst_case_then_settles_the_actual(httpserver: HTTPServer):
    ledger = Ledger()
    httpserver.expect_request("/v1/messages", method="POST").respond_with_json(message(json.dumps({"questions": ["What happened next?"]})))
    out = await gateway(httpserver, ledger).ask("coach", "system", "data", SCHEMA, max_tokens=2048)
    assert out == {"questions": ["What happened next?"]}
    assert ledger.reserved == [Decimal("1000") * Decimal("0.10") / 1_000_000 + Decimal("2048") * Decimal("0.50") / 1_000_000]
    assert ledger.settled == [("coach", "claude-haiku-5-5", 1000, 200, Decimal("1000") * Decimal("0.10") / 1_000_000 + Decimal("200") * Decimal("0.50") / 1_000_000)]

async def test_sends_haiku_medium_effort_structured_output_and_no_tools(httpserver: HTTPServer):
    httpserver.expect_request("/v1/messages", method="POST").respond_with_json(message(json.dumps({"questions": ["Why?"]})))
    await gateway(httpserver, Ledger()).ask("coach", "system", "data", SCHEMA)
    body = json.loads(next(r for r, _ in httpserver.log if r.path == "/v1/messages").data)
    assert body["model"] == "claude-haiku-5-5" and "tools" not in body
    assert body["output_config"] == {"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}}

async def test_the_cap_refuses_before_claude_is_called(httpserver: HTTPServer):
    with pytest.raises(AiError) as e:
        await gateway(httpserver, Ledger(refuse=True)).ask("coach", "s", "d", SCHEMA)
    assert e.value.details == {"reason": "daily_cap"}
    assert not any(r.path == "/v1/messages" for r, _ in httpserver.log)

async def test_refusal_is_ai_unavailable_refusal(httpserver: HTTPServer):
    ledger = Ledger()
    httpserver.expect_request("/v1/messages", method="POST").respond_with_json(message("", stop="refusal"))
    with pytest.raises(AiError) as e:
        await gateway(httpserver, ledger).ask("coach", "s", "d", SCHEMA)
    assert e.value.details == {"reason": "refusal"} and len(ledger.settled) == 1

async def test_reply_outside_schema_is_invalid_reply(httpserver: HTTPServer):
    httpserver.expect_request("/v1/messages", method="POST").respond_with_json(message(json.dumps({"answer": "a level 3"})))
    with pytest.raises(AiError) as e:
        await gateway(httpserver, Ledger()).ask("coach", "s", "d", SCHEMA)
    assert e.value.details == {"reason": "invalid_reply"}

async def test_one_retry_on_a_5xx_then_upstream(httpserver: HTTPServer):
    ledger = Ledger()
    httpserver.expect_request("/v1/messages", method="POST").respond_with_json({"type": "error", "error": {"type": "api_error", "message": "x"}}, status=500)
    with pytest.raises(AiError) as e:
        await gateway(httpserver, ledger).ask("coach", "s", "d", SCHEMA)
    assert e.value.details == {"reason": "upstream"}
    assert sum(r.path == "/v1/messages" for r, _ in httpserver.log) == 2
    assert ledger.settled[0][2:4] == (0, 0)  # nothing spent: the reservation is released at zero
```

```python
# ai/tests/test_gateway.py, continued
import time
from werkzeug import Response

async def test_timeout_is_ai_unavailable_timeout(httpserver: HTTPServer):
    def slow(_request):
        time.sleep(1)
        return Response(json.dumps(message(json.dumps({"questions": ["Late?"]}))), content_type="application/json")
    httpserver.expect_request("/v1/messages/count_tokens").respond_with_json({"input_tokens": 1000})
    httpserver.expect_request("/v1/messages", method="POST").respond_with_handler(slow)
    g = ClaudeGateway(client_for("test-key", httpserver.url_for("").rstrip("/"), timeout=0.2), Ledger())
    with pytest.raises(AiError) as e:
        await g.ask("coach", "s", "d", SCHEMA)
    assert e.value.details == {"reason": "timeout"}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ai && uv run pytest tests/test_gateway.py -v`
Expected: FAIL, `ModuleNotFoundError: No module named 'sidecar.gateway'`.

- [ ] **Step 3: Write the gateway**

```python
# ai/sidecar/gateway.py
import json
from decimal import Decimal
import anthropic
from .errors import unavailable

PRICE_IN = Decimal("0.10") / 1_000_000   # claude-haiku-5-5, prompts up to 100K tokens
PRICE_OUT = Decimal("0.50") / 1_000_000

def client_for(api_key: str | None, base_url: str | None = None, timeout: float = 15.0) -> anthropic.AsyncAnthropic:
    """15 s, and one retry on 429, 5xx or a connection error: the SDK's own retry."""
    return anthropic.AsyncAnthropic(api_key=api_key, base_url=base_url, timeout=timeout, max_retries=1)

def _valid(value: object, schema: dict) -> bool:
    """The reply's shape, checked again here: structured output constrains it, and
    this is the line a reply crosses before any of it reaches a student."""
    if schema.get("type") == "object":
        return (isinstance(value, dict) and set(value) == set(schema.get("required", value))
                and all(_valid(value[k], schema["properties"][k]) for k in value))
    if schema.get("type") == "array":
        return (isinstance(value, list) and schema.get("minItems", 0) <= len(value) <= schema.get("maxItems", len(value))
                and all(_valid(v, schema["items"]) for v in value))
    if schema.get("type") == "string":
        return isinstance(value, str)
    return False

class ClaudeGateway:
    """The only code that calls Claude: spend cap, timeout, retry, refusal, usage."""

    def __init__(self, client: anthropic.AsyncAnthropic, ledger, model: str = "claude-haiku-5-5"):
        self._client, self._ledger, self._model = client, ledger, model

    async def ask(self, feature: str, system: str, data: str, schema: dict, max_tokens: int = 2048) -> dict:
        messages = [{"role": "user", "content": data}]
        output_config = {"effort": "medium", "format": {"type": "json_schema", "schema": schema}}
        try:
            counted = await self._client.messages.count_tokens(model=self._model, system=system, messages=messages, output_config=output_config)
        except anthropic.APITimeoutError:
            raise unavailable("timeout")
        except (anthropic.APIStatusError, anthropic.APIConnectionError):
            raise unavailable("upstream")
        reservation = await self._ledger.reserve(counted.input_tokens * PRICE_IN + max_tokens * PRICE_OUT)
        used_in = used_out = 0
        try:
            response = await self._client.messages.create(model=self._model, max_tokens=max_tokens, system=system,
                                                           messages=messages, output_config=output_config)
            used_in, used_out = response.usage.input_tokens, response.usage.output_tokens
        except anthropic.APITimeoutError:
            raise unavailable("timeout")
        except (anthropic.APIStatusError, anthropic.APIConnectionError):
            raise unavailable("upstream")
        finally:
            await self._ledger.settle(reservation, feature, self._model, used_in, used_out, used_in * PRICE_IN + used_out * PRICE_OUT)
        if response.stop_reason == "refusal":
            raise unavailable("refusal")  # Haiku has no server-side fallback; nothing retries a refusal
        text = "".join(block.text for block in response.content if block.type == "text")
        try:
            value = json.loads(text)
        except ValueError:
            raise unavailable("invalid_reply")
        if not _valid(value, schema):
            raise unavailable("invalid_reply")
        return value
```

If the SDK version in the lock rejects `output_config` on `count_tokens`, drop that argument from the count call only: the format adds a few hundred tokens, within the `max_tokens` margin already reserved.

- [ ] **Step 4: Run them and watch them pass**

Run: `cd ai && uv run pytest tests/test_gateway.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add ai && git commit -m "feat(ai): ClaudeGateway, the only code that calls Claude (HO-9)"
```

### Task 8: CI, the documents, and the whole suite

**Files:**
- Modify: `.github/workflows/ci.yml` (new `ai` job)
- Modify: `docs/Frontend-and-Backend.md` (the second contract), `docs/Retention-and-Erasure.md` (embeddings), `docs/Architecture.md` (the sidecar box, off by default)
- Modify: `README.md` (`ai/` in the repository layout, if the layout table lists top-level folders)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Add the CI job**

```yaml
  ai:
    name: AI sidecar
    runs-on: ubuntu-latest
    # ADR #64. A throwaway MySQL for the store tests: never the shared server.
    services:
      mysql:
        image: mysql:9.7
        env:
          MYSQL_ROOT_PASSWORD: test
          MYSQL_DATABASE: diary_ai
        ports: ["3306:3306"]
        options: >-
          --health-cmd="mysqladmin ping -h 127.0.0.1 -ptest" --health-interval=5s --health-timeout=5s --health-retries=20
    defaults:
      run:
        working-directory: ai
    steps:
      - uses: actions/checkout@v5
      - uses: astral-sh/setup-uv@v6
      - name: Install
        run: uv sync --locked
      - name: Tests (the real embedding model is marked slow and not run here)
        env:
          AI_TEST_DATABASE_URL: mysql://root:test@127.0.0.1:3306/diary_ai
        run: uv run pytest -v
```

- [ ] **Step 2: Update the documents**

- `docs/Frontend-and-Backend.md`: a section "The second contract": `docs/ai-openapi.yaml` describes `/ai/v1`, the sidecar implements it, `web/` will generate `ai-schema.ts` from it in step 4, and Laravel never reads it.
- `docs/Retention-and-Erasure.md`: `diary_ai.entry_vectors` holds a 384-number vector per narrative, derived from personal data; deleting a person means deleting their entries' rows there too (by entry id), and the demo reset empties every table.
- `docs/Architecture.md`: the sidecar beside Laravel, reading it with the caller's token, off by default (ADR #64).

- [ ] **Step 3: Run everything**

Run: `cd ai && AI_TEST_DATABASE_URL=mysql://root:test@127.0.0.1:3307/diary_ai uv run pytest -v && uv run pytest -m slow -v && cd .. && npx -y @redocly/cli@latest lint docs/ai-openapi.yaml && python3 scripts/check-docs.py`
Expected: every test passes, the slow one too; Redocly valid; docs check passes.

- [ ] **Step 4: Commit and open the PR**

```bash
git add .github/workflows/ci.yml docs README.md && git commit -m "ci: the AI sidecar's tests on a throwaway MySQL; docs for the second contract (HO-9)"
```

PR into `dev`, a reviewer requested, HO-9 commented with what merged and what step 4 adds.
