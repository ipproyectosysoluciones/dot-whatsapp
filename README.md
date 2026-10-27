<a id="top"></a>

# dot-whatsapp

**Your Gentle Dot assistant, one WhatsApp message away.** *(prototype — study-backed scaffold)*

> ⚠️ **Prototype.** Talks to Gentle Dot's client protocol v1, which is not a published API and may change. Relays an assistant that can act on your behalf: read Security below before running it. Uses Baileys (unofficial WhatsApp Web client): use a **dedicated number**, human volume; see the study for the ban risk and the planned official Meta Cloud API provider.

## What it is

An opt-in, separate process — like [dot-telegram](#) — that joins the Gentle Dot daemon as one more WebSocket client (`protocol v1`, access key from `~/.gentle-dot/token`) and relays one allowlisted WhatsApp conversation. Gentle Dot itself never changes. If you do not run it, it does not exist.

Design decisions (dual-provider Meta Cloud API + Baileys, Engram as memory and bridge DB) live in the study: `../Propuesta — dot-whatsapp (WhatsApp para Gentle Dot).md`.

## Status

Working bridge: Baileys transport (QR pairing, session persisted in `~/.dot-whatsapp/auth`), E.164 allowlist relay to the Gentle Dot daemon, Engram-backed idempotency, systemd `--user` service (see `docs/RUNBOOK.md`). Provider seam landed: the `ChannelTransport` interface + factory pick the transport from config; `meta-cloud` is a stub proving the seam (real Cloud API is phase 2).

## Providers

`DOT_WHATSAPP_PROVIDER` selects the transport (default `baileys`):

- `baileys` — unofficial WhatsApp Web client. Use a **dedicated number**, human volume; ban risk, see the study.
- `meta-cloud` — official Meta Cloud API: signature-validated webhook receiver + Graph API sends behind the same `ChannelTransport` interface. Requires owner-side Meta Business setup: phone number id, Graph token, verify token, app secret (env `DOT_WHATSAPP_META_*`), and a publicly reachable URL for the webhook (reverse proxy or tunnel). Switching providers changes nothing else in the bridge.

## Security (phase 1, non-negotiable)

- Allowlist of E.164 numbers only; anything else is ignored and logged.
- Anti-loop: own messages, broadcasts and statuses are never relayed.
- Baileys credentials on disk with mode 700; the daemon access key is re-read from its file before every connection.
- Idempotency (Engram, `topic_key msg-<wa-id>`) so a restart never double-sends.

MIT License (c) 2026 Bladimir. `daemon-client.ts` / `protocol.ts` derive from dot-telegram, created by Daniel (danielgap), MIT — see LICENSE for the derivative-work notice.
