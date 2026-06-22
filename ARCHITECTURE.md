# Architecture

A file-by-file map of the project. Kept current at the end of each build phase.

**Status:** auth + messaging complete — login/sessions/invites, servers with one text + one voice channel, encrypted message history, live fan-out, and the chat UI. Next: joining someone else's server (per-server invites), then file sharing, then voice/screen via LiveKit.

## Shape

```
Discord Clone/
├─ package.json, tsconfig.base.json, .gitignore, .gitattributes, README.md   ← project-wide
├─ packages/shared/     ← types both sides agree on
├─ apps/server/         ← backend (Node + Fastify + SQLite)
├─ apps/web/            ← frontend (React + Vite)
├─ infra/               ← deployment (Docker + Caddy + LiveKit)
└─ docs/design/         ← original mockup
```

`packages/*` and `apps/*` are workspaces — separate mini-projects sharing one `node_modules`, able to import each other (`@dc/shared`, `@dc/server`, `@dc/web`).

The one-sentence flow: the browser (`App.tsx`) asks "who am I?" via `api.ts` → `AuthContext`; the server's `index.ts` routes that to `auth/routes.ts`, which uses `auth/guard.ts` to check the session via `auth/sessions.ts` against the database in `db.ts`; `packages/shared` is the dictionary both sides speak.

## Root — project-wide config

- `package.json` — monorepo control panel: declares the workspaces and top-level scripts (`dev`, `build`, `typecheck`). Delegates to workspaces.
- `tsconfig.base.json` — shared TypeScript rules every workspace extends.
- `.gitignore` — never-track list: `node_modules/`, `dist/`, runtime `data/`, `*.sqlite`, `.env`.
- `.gitattributes` — `* text=auto` line-ending normalization.
- `README.md` — human overview and how to run locally.

## packages/shared — the shared contract

- `src/index.ts` — TypeScript types both server and browser use: `User`, `Community`, `Channel`, `Message`, `DirectConversation`, WebSocket events, and auth payloads (`AuthedUser`, `LoginRequest`, `RegisterRequest`, `InviteInfo`, …). Shapes only, no logic.
- `package.json` / `tsconfig.json` — names the package `@dc/shared` and its TS config.

## apps/server — the backend

Auth request flow: `index.ts → auth/guard → auth/routes → (passwords / sessions / invites) → db`.

- `src/index.ts` — entry point. Opens the DB, registers plugins (cookie, rate-limit, websocket), installs the global CSRF check, mounts the health check + all routes, and starts the WebSocket endpoint (authenticated by the session cookie).
- `src/db.ts` — opens SQLite (`node:sqlite`) and creates tables if missing.
- `src/auth/passwords.ts` — **[auth]** scrypt password hashing + constant-time verification. Passwords never stored in plaintext.
- `src/auth/sessions.ts` — **[auth]** session ledger: create the random cookie ticket (storing only its hash), look it up + slide the 30-day expiry, destroy tickets on logout/removal.
- `src/auth/invites.ts` — **[auth]** single-use invite tokens; atomic register-and-consume transaction.
- `src/auth/guard.ts` — **[auth]** route protectors: `requireAuth` (401 without a valid session), `requireAdmin` (403 unless admin), `csrfGuard` (requires the `x-dc-web` header on writes).
- `src/auth/routes.ts` — **[auth]** endpoints: `/api/auth/login`, `/register`, `/logout`, `/me`, and `/api/invites` (mint/list/revoke/validate).
- `src/auth/types.ts` — **[auth]** tells TypeScript a request may carry `req.user`.
- `src/scripts/create-user.ts` — **[auth]** one-time CLI to bootstrap the first admin (`npm run create-user`).
- `src/communities/store.ts` — data layer for servers + channels: create a server (owner + member + one text + one voice channel), list, membership checks (`isMember`/`isOwner`), `getChannel`.
- `src/communities/routes.ts` — `/api/communities` create/list and `/api/communities/:id/channels` (members only).
- `src/messages/store.ts` — send (encrypt + store + assign seq) and list history (decrypt, join author name).
- `src/messages/routes.ts` — `/api/channels/:id/messages` send/list (member + text-channel checks); broadcasts new messages via the hub.
- `src/crypto.ts` — AES-256-GCM at-rest encryption keyed by `MASTER_KEY`.
- `src/realtime/hub.ts` — in-memory registry of WebSocket connections + their channel subscriptions; `broadcast` pushes a message to watchers.
- `.env.example` — template for secrets/config (port, data dir, at-rest `MASTER_KEY`). Copied to gitignored `.env`.
- `package.json` / `tsconfig.json` — server deps (Fastify, cookie, rate-limit) + scripts.

## apps/web — the frontend

Browser flow: `main.tsx → App.tsx (bouncer) → Login/Register or AppShell`, with `AuthContext` + `api.ts` underneath.

- `index.html` — the page the browser loads; hosts an empty `#root`.
- `src/main.tsx` — mounts the React app.
- `src/App.tsx` — **[auth]** router + bouncer: routes (`/login`, `/invite/:token`, protected `/*`) and the gate (loading → redirect → app).
- `src/auth/AuthContext.tsx` — **[auth]** the "who am I?" memory: calls `/api/auth/me` once, holds the user, exposes `login`/`register`/`logout`.
- `src/api.ts` — fetch wrapper: attaches CSRF header, carries the cookie, throws `ApiError` on failure.
- `src/pages/Login.tsx` — **[auth]** the login screen.
- `src/pages/Register.tsx` — **[auth]** invite registration; validates the token first (checking → valid form / dead-link).
- `src/pages/authStyles.ts` — shared inline styles for the auth screens.
- `src/components/AuthShell.tsx` — centered dark card the auth screens sit in.
- `src/AppShell.tsx` — the logged-in app: owns navigation state (selected server/channel), fetches servers + channels, holds the admin invite button, and renders the rail / channel list / chat.
- `src/socket/SocketContext.tsx` — owns the single session WebSocket; `subscribe`/`unsubscribe` to channels, `onMessageCreated` handler registration, auto-reconnect + re-subscribe.
- `src/chat/ChatView.tsx` — a channel's message list (history + live appends) and the composer.
- `src/chat/ChannelList.tsx` — the second column when a server is open: its text + voice channels.
- `src/components/CreateServerModal.tsx` — the "+" dialog to create a server.
- `src/components/ServerRail.tsx` — 72px rail: home, one pill per server you're in, and create.
- `src/components/DmSidebar.tsx` — 240px DM/friends sidebar shown on the home view (placeholder).
- `src/components/ActiveNow.tsx` — right "Active Now" panel on the home view (placeholder).
- `src/theme.ts` — color + layout tokens from the mockup.
- `src/index.css` — global base styles (scrollbars, `.auth-input`).
- `vite.config.ts` — dev server; proxies `/api` + `/ws` to the backend (mirrors Caddy in prod).
- `package.json` / `tsconfig.json` — web deps (React, react-router) + scripts.

## infra — deployment (not used in local dev yet)

- `home/docker-compose.yml` — home stack: Caddy + web + server, with `data/` persisted.
- `home/Caddyfile` — routing on the home box: `/api` + `/ws` → backend, else → web.
- `vps/docker-compose.yml` — VPS stack: LiveKit + its own Caddy.
- `vps/Caddyfile` — HTTPS for the SFU domain.
- `vps/livekit.yaml` — LiveKit config (ports, API keys). For the voice/screen phase.

## docs

- `design/chat-app-mockup.html` — original single-file design mockup; styling reference.
