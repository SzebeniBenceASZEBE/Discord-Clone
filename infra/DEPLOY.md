# Deploying to a VPS

Everything runs on one rented VPS: a single **Caddy** terminates TLS and routes
two subdomains, the **Node backend** holds the data (SQLite + encrypted files),
and **LiveKit** relays voice/screen. **Cloudflare** only manages DNS (not proxied).

```
Internet ──► Caddy (443)
               ├─ chat.<domain>  → web (static) + /api,/ws → server:3001
               └─ sfu.<domain>   → livekit:7880 (signalling)
LiveKit media: UDP 50000–50100 + TCP 7881 straight to the VPS
```

## 1. A VPS

Any small Linux VPS with a public IP works. Recommended: **Hetzner CX22**
(~€5/mo, Germany, 2 vCPU / 4 GB / 40 GB), **Ubuntu 24.04**. SSH in, then install
Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. Domain + Cloudflare DNS (grey cloud!)

Add your domain to Cloudflare (free). Create two **A records**, both pointing to
the VPS's public IP, and **turn the proxy OFF (grey cloud, "DNS only")**:

| Type | Name | Content        | Proxy        |
|------|------|----------------|--------------|
| A    | chat | `<VPS IP>`     | DNS only 🔘  |
| A    | sfu  | `<VPS IP>`     | DNS only 🔘  |

Grey cloud matters: Cloudflare's proxy would read your traffic, cap uploads at
100 MB, and break LiveKit's UDP. DNS-only keeps Cloudflare out of the data path
and lets Caddy get its own Let's Encrypt certificate.

## 3. Firewall

```bash
ufw allow 22/tcp          # SSH
ufw allow 80,443/tcp      # Caddy (HTTP challenge + HTTPS)
ufw allow 7881/tcp        # LiveKit TCP fallback
ufw allow 50000:50100/udp # LiveKit media
ufw enable
```

## 4. Get the code and configure

```bash
git clone https://github.com/SzebeniBenceASZEBE/Discord-Clone.git
cd Discord-Clone/infra
cp .env.example .env
```

Edit `.env` and set:
- `CHAT_DOMAIN=chat.yourdomain.com`, `SFU_DOMAIN=sfu.yourdomain.com`, `APP_URL=https://chat.yourdomain.com`
- `MASTER_KEY` — generate once and **keep it safe forever** (losing it = all stored messages/files become unreadable):
  ```bash
  openssl rand -base64 32
  ```
- `LIVEKIT_API_KEY` — any short id, e.g. `APIprod01`
- `LIVEKIT_API_SECRET` — `openssl rand -base64 32`

## 5. Start it

```bash
docker compose up -d --build
```

First start takes a minute (it builds the images and Caddy fetches certificates).
Check logs with `docker compose logs -f caddy` / `server` / `livekit`.

## 6. Create your admin account

```bash
docker compose exec server node --import tsx apps/server/src/scripts/create-user.ts bence "Your Name"
```

It prompts for a password. After this, invite everyone else from inside the app.

## 7. Test

Open `https://chat.yourdomain.com`, log in, send a message, share a file, and
join a voice channel (with a friend or a second browser). Voice is E2EE, so
use Chrome/Edge or Firefox.

---

## Day-to-day

- **Update to a new version:** `git pull && docker compose up -d --build`
- **Back up** (do this regularly): the `infra/data/` folder (SQLite + files) and
  your `.env` — especially `MASTER_KEY`. Without `MASTER_KEY`, backups are
  useless.
- **Logs:** `docker compose logs -f <caddy|server|livekit>`
- **Stop / start:** `docker compose down` / `docker compose up -d`

## Adding Nyxa (or anything else) later

Run it as another service on the same VPS and add a block to `infra/Caddyfile`:

```
nyxa.yourdomain.com {
	reverse_proxy nyxa:<port>
}
```

plus a `nyxa` DNS-only A record. One Caddy fronts everything.

## Troubleshooting

- **No certificate / site not loading:** make sure the Cloudflare records are
  **DNS only** (grey) and ports 80+443 are open and reachable.
- **Voice connects but no audio/garbled:** everyone must be on Chrome/Edge or
  Firefox (E2EE needs insertable streams); check UDP 50000–50100 + TCP 7881 are
  open.
- **Voice won't connect at all:** check `LIVEKIT_URL` is `wss://sfu.yourdomain.com`
  and the `sfu` record resolves to the VPS.
