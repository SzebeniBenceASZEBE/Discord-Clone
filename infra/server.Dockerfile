# The Node backend (API + WebSocket + SQLite + encrypted files). Runs via tsx,
# the same way we run it in dev. Build context is the repo root.
FROM node:24-alpine
WORKDIR /app

# Install all workspace deps (dev deps included — we run TypeScript with tsx).
COPY . .
RUN npm ci

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
