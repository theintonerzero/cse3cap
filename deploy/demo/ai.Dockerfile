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

# The user first, so every later layer is written as it and nothing is
# copied twice by a chown.
RUN useradd --system --create-home --uid 10001 sidecar && mkdir -p /opt/fastembed && chown sidecar /opt/fastembed

WORKDIR /app/ai
COPY ai/pyproject.toml ai/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# The embedding model, fetched before the code is copied: a code change reuses
# this layer rather than downloading the model again (spec: "model weights
# baked in at build"). Keep the name in step with sidecar/embedder.py's MODEL;
# scripts/deploy-demo.test.py checks it.
USER sidecar
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='BAAI/bge-small-en-v1.5')"

COPY --chown=sidecar ai/sidecar ./sidecar
# The roots the diary_ai connection verifies the database's name against, the
# API's own (db/letsencrypt-roots.pem), so DATABASE_CA has a file to name.
COPY db/letsencrypt-roots.pem /app/db/letsencrypt-roots.pem

EXPOSE 8000
CMD ["uvicorn", "sidecar.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
