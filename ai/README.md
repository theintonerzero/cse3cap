# ai/: the AI sidecar

The Reflection Diary's AI sidecar, decided in ADR #64 and designed in
`docs/superpowers/specs/2026-10-09-ai-sidecar-and-live-demo-design.md`. A Python
(FastAPI) service at `/ai/v1`, with its own contract, `docs/ai-openapi.yaml`, and
its own database, `diary_ai`. It reads the diary's API with the caller's own
token, never writes to it, and is off unless `AI_ENABLED` is set. Laravel does
not depend on it.

## Running the tests

```bash
cd ai
uv sync          # Python 3.12 and the dependencies, from uv.lock
uv run pytest    # or ./run ai-test from the repository root
```

The tests that need a database read `AI_TEST_DATABASE_URL` and skip without it.
Point it at a **throwaway** MySQL, never the shared server: the tests drop and
recreate every table.

```bash
docker run -d --name diary-ai-test -e MYSQL_ROOT_PASSWORD=test \
  -e MYSQL_DATABASE=diary_ai -p 3307:3306 mysql:9.7
AI_TEST_DATABASE_URL=mysql://root:test@127.0.0.1:3307/diary_ai uv run pytest
```

The one test that loads the real embedding model is marked `slow` and left out
by default: `uv run pytest -m slow`.
