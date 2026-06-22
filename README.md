# Private Chat — self-hosted Discord alternative

A private, self-hosted chat/voice app for a small group of friends. Text chat with
full history, file/image sharing, and multi-party voice + screen share. Runs as a
Docker stack on a home server, with the LiveKit media server on a small VPS so the
home uplink never becomes the bottleneck.

## Architecture

- **Home server** (Docker): Caddy (HTTPS + routing via DuckDNS) → web app + Node
  backend (API, WebSocket fan-out) + SQLite (messages, file metadata) + encrypted
  file blobs on disk + auth/key service.
- **VPS** (Docker): LiveKit SFU for voice/screen, fronted by its own Caddy + cert.
- **Security:** TLS everywhere; messages/files encrypted at rest with server-managed
  keys; member-to-member privacy enforced by backend authorization; LiveKit call
  media end-to-end encrypted (insertable streams) so the rented VPS can relay but
  not read.

## Repo layout

```
apps/web         Vite + React + TypeScript frontend (rebuilt from the design mockup)
apps/server      Node + Fastify backend: REST API, WebSocket, SQLite, files, auth/keys
packages/shared  TypeScript types shared by web + server
infra/home       docker-compose + Caddyfile for the home stack
infra/vps        docker-compose + Caddyfile + LiveKit config for the VPS
docs/design      Original UI mockup (chat-app-mockup.html) — design reference only
```

## Local development

```sh
npm install                 # install all workspaces
cp apps/server/.env.example apps/server/.env   # then fill in MASTER_KEY
npm run dev                 # web on :5173 (proxies /api + /ws to server on :3001)
```

Open http://localhost:5173 — the connection pill turns green when the browser
reaches the backend over the WebSocket.

## Status

Scaffold only. Built so far: monorepo, dev tooling, the three-pane home shell, a
health endpoint, and a WebSocket handshake. Next phases: auth + invites, communities
& text channels with history, DMs, file/image sharing, then LiveKit voice/screen.
