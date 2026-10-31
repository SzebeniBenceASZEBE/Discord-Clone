# Builds the web app to static files, then bakes them into a Caddy image. Caddy
# serves the static site AND is the TLS front door / reverse proxy (see Caddyfile).
FROM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build --workspace apps/web

FROM caddy:2-alpine
COPY --from=build /app/apps/web/dist /srv
COPY infra/Caddyfile /etc/caddy/Caddyfile
