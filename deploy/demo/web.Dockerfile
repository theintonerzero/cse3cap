# The demo bundle and its internal web server (CAP-54, ADR #62). The bundle is
# built with a personas URL and no tokens; ./run bundle-secrets proves that shape.
FROM node:24-bookworm-slim AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
ENV VITE_API_BASE_URL=/api/v1 \
    VITE_AI_BASE_URL=/ai/v1 \
    VITE_DEMO_PERSONAS_URL=/demo/personas.json \
    VITE_API_TOKEN= \
    VITE_DEMO_SHELL= \
    VITE_DEMO_TOKENS=
RUN rm -f .env .env.local .env.development.local .env.production.local && npm run build

FROM caddy:2
COPY deploy/demo/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/web/dist /srv/web
# The presenter's phone frame (CAP-55). Here only, never in the product bundle.
COPY deploy/demo/phone /srv/phone
# php_fastcgi checks the front controller exists on this side before passing on.
COPY api/public /app/api/public
