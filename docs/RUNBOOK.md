# dot-whatsapp Runbook

Operational guide for running the dot-whatsapp bridge as a systemd user service.

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Create .env from template
cp .env.example .env
# Edit .env with your values (see below)

# 3. Run once to test (QR pairing)
pnpm start:env

# 4. Install systemd service
systemctl --user enable --now dot-whatsapp.service

# 5. Check status
systemctl --user status dot-whatsapp
journalctl --user -u dot-whatsapp -f
```

---

## Environment Variables (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOT_WHATSAPP_ALLOWED_NUMBERS` | ✅ | — | Comma-separated E.164 numbers (digits only, no `+`) |
| `DOT_WHATSAPP_PROVIDER` | — | `baileys` | `baileys` or `meta-cloud` |
| `GENTLE_DOT_URL` | — | `ws://127.0.0.1:4317/ws` | Daemon WebSocket URL |
| `GENTLE_DOT_TOKEN_FILE` | — | `~/.gentle-dot/token` | Daemon access key file |
| `ENGRAM_URL` | — | `http://127.0.0.1:47821` | Engram server URL |
| `DOT_WHATSAPP_ENGRAM_PROJECT` | — | `dot-whatsapp` | Engram project name |
| `DOT_WHATSAPP_AUTH_DIR` | — | `~/.dot-whatsapp/auth` | Baileys credentials (mode 700) |
| `DOT_WHATSAPP_ADMIN_PORT` | — | `4407` | Admin API port (127.0.0.1) |
| `DOT_WHATSAPP_ADMIN_TOKEN_FILE` | — | `~/.dot-whatsapp/admin-token` | Admin API bearer token (0600) |
| `DOT_WHATSAPP_ALLOWLIST_FILE` | — | `~/.dot-whatsapp/allowlist.json` | Allowlist persistence (0600) |

### Meta Cloud API (when `DOT_WHATSAPP_PROVIDER=meta-cloud`)

| Variable | Required | Default |
|----------|----------|---------|
| `DOT_WHATSAPP_META_PHONE_NUMBER_ID` | ✅ | — |
| `DOT_WHATSAPP_META_TOKEN` | ✅ | — |
| `DOT_WHATSAPP_META_VERIFY_TOKEN` | ✅ | — |
| `DOT_WHATSAPP_META_APP_SECRET` | ✅ | — |
| `DOT_WHATSAPP_META_WEBHOOK_PORT` | — | `4408` |
| `DOT_WHATSAPP_META_WEBHOOK_HOST` | — | `0.0.0.0` |
| `DOT_WHATSAPP_META_GRAPH_URL` | — | `https://graph.facebook.com` |
| `DOT_WHATSAPP_META_GRAPH_VERSION` | — | `v21.0` |

---

## Systemd Service

### Install

```bash
# Copy service file
mkdir -p ~/.config/systemd/user
cp docs/dot-whatsapp.service ~/.config/systemd/user/

# Reload and enable
systemctl --user daemon-reload
systemctl --user enable --now dot-whatsapp
```

### Service File (`docs/dot-whatsapp.service`)

```ini
[Unit]
Description=dot-whatsapp bridge (Gentle Dot WhatsApp channel)
After=network.target
Wants=network-online.target

[Service]
Type=simple
Environment=PATH=%h/.local/bin:/usr/local/bin:/usr/bin:/bin
EnvironmentFile=%h/.config/dot-whatsapp/env
ExecStart=%h/.local/bin/pnpm --dir %h/proyectos/work/gentleman/dot-whatsapp start:env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=%h/.dot-whatsapp %h/.gentle-dot %h/.engram

[Install]
WantedBy=default.target
```

### User Environment File (`~/.config/dot-whatsapp/env`)

Create this file with your environment variables (one per line, no `export`):

```bash
DOT_WHATSAPP_ALLOWED_NUMBERS=5491112345678,5491123456789
DOT_WHATSAPP_PROVIDER=baileys
GENTLE_DOT_URL=ws://127.0.0.1:4317/ws
ENGRAM_URL=http://127.0.0.1:47821
# Meta Cloud (when using meta-cloud provider)
# DOT_WHATSAPP_META_PHONE_NUMBER_ID=...
# DOT_WHATSAPP_META_TOKEN=...
# DOT_WHATSAPP_META_VERIFY_TOKEN=...
# DOT_WHATSAPP_META_APP_SECRET=...
```

---

## Common Operations

### Check Status

```bash
# Service status
systemctl --user status dot-whatsapp

# Follow logs
journalctl --user -u dot-whatsapp -f

# Admin API status
curl -H "Authorization: Bearer $(cat ~/.dot-whatsapp/admin-token)" \
  http://127.0.0.1:4407/status
```

### Pairing (Baileys)

```bash
# 1. Start pairing
curl -X POST -H "Authorization: Bearer $(cat ~/.dot-whatsapp/admin-token)" \
  http://127.0.0.1:4407/pair/start

# 2. Get QR (poll until not null)
curl -H "Authorization: Bearer $(cat ~/.dot-whatsapp/admin-token)" \
  http://127.0.0.1:4407/pair/status

# 3. Scan QR with WhatsApp on phone
# 4. Verify connection
curl -X POST -H "Authorization: Bearer $(cat ~/.dot-whatsapp/admin-token)" \
  http://127.0.0.1:4407/verify
```

### Allowlist Management

```bash
# List (masked)
curl -H "Authorization: Bearer $(cat ~/.dot-whatsapp/admin-token)" \
  http://127.0.0.1:4407/allowlist

# Add
curl -X POST -H "Authorization: Bearer $(cat ~/.dot-whatsapp/admin-token)" \
  -H "Content-Type: application/json" \
  -d '{"action":"add","number":"5491123456789"}' \
  http://127.0.0.1:4407/allowlist

# Remove
curl -X POST -H "Authorization: Bearer $(cat ~/.dot-whatsapp/admin-token)" \
  -H "Content-Type: application/json" \
  -d '{"action":"remove","number":"5491123456789"}' \
  http://127.0.0.1:4407/allowlist
```

### Unpair

```bash
curl -X POST -H "Authorization: Bearer $(cat ~/.dot-whatsapp/admin-token)" \
  http://127.0.0.1:4407/unpair
```

---

## Troubleshooting

### Bridge won't start

```bash
# Check logs
journalctl --user -u dot-whatsapp --no-pager -n 50

# Common issues:
# 1. Engram not running → start engram: engram serve
# 2. Daemon not running → start gentle-dot daemon
# 3. Token file missing → check ~/.gentle-dot/token exists
# 4. Port conflict → check 4407/4408 not in use
```

### QR pairing fails

```bash
# 1. Regenerate QR
curl -X POST -H "Authorization: Bearer $(cat ~/.dot-whatsapp/admin-token)" \
  http://127.0.0.1:4407/pair/regenerate

# 2. Clear auth and retry
rm -rf ~/.dot-whatsapp/auth/*
systemctl --user restart dot-whatsapp
```

### Meta Cloud webhook not receiving

```bash
# 1. Check public URL is reachable
curl -X POST https://your-domain.com/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d '{"test":true}'

# 2. Verify token matches
# 3. Check bridge logs for HMAC validation errors
```

### Allowlist not persisting

```bash
# Check file permissions
ls -la ~/.dot-whatsapp/allowlist.json
# Should be 0600

# Check parent directory
ls -la ~/.dot-whatsapp/
```

---

## File Locations

| Path | Purpose | Permissions |
|------|---------|-------------|
| `~/.dot-whatsapp/auth/` | Baileys credentials | 700 |
| `~/.dot-whatsapp/admin-token` | Admin API bearer token | 600 |
| `~/.dot-whatsapp/allowlist.json` | Allowlist persistence | 600 |
| `~/.gentle-dot/token` | Daemon access key | 600 |
| `~/.config/dot-whatsapp/env` | systemd EnvironmentFile | 600 |

---

## Upgrade / Update

```bash
cd /path/to/dot-whatsapp
git pull
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
systemctl --user restart dot-whatsapp
```

---

## Development

```bash
# Run tests
pnpm test

# Typecheck
pnpm typecheck

# Run with .env (for local dev)
pnpm start:env
```

---

## License

MIT License (c) 2026 Bladimir. `daemon-client.ts` / `protocol.ts` derive from dot-telegram, created by Daniel (danielgap), MIT — see LICENSE for the derivative-work notice.