# The AI sidecar (CAP-69, ADR #64), built from the repository at the deployed
# SHA like the API and the web image. With no ai.env it starts with AI off and
# answers 404 AI_DISABLED, so shipping it changes nothing until it is switched on.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.18 /uv /usr/local/bin/uv

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/opt/venv/bin:$PATH" \
    FASTEMBED_CACHE_PATH=/opt/fastembed \
    PYTHONUNBUFFERED=1

WORKDIR /app/ai
COPY ai/pyproject.toml ai/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY ai/sidecar ./sidecar
# The roots the diary_ai connection verifies the database's name against, the
# API's own (db/letsencrypt-roots.pem), so DATABASE_CA has a file to name.
COPY db/letsencrypt-roots.pem /app/db/letsencrypt-roots.pem

# The embedding model, downloaded now so the first request after a start
# doesn't wait on it (spec: "model weights baked in at build").
RUN python -c "from sidecar.embedder import FastEmbedder; FastEmbedder()"

RUN useradd --system --uid 10001 sidecar && chown -R sidecar /opt/fastembed
USER sidecar

EXPOSE 8000
CMD ["uvicorn", "sidecar.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
