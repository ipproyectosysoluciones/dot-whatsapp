<a id="top"></a>

# dot-whatsapp

**Your Gentle Dot assistant, one WhatsApp message away.** *(prototype — study-backed scaffold)*

> ⚠️ **Prototype.** Talks to Gentle Dot's client protocol v1, which is not a published API and may change. Relays an assistant that can act on your behalf: read Security below before running it. Uses Baileys (unofficial WhatsApp Web client): use a **dedicated number**, human volume; see the study for the ban risk and the planned official Meta Cloud API provider.

## What it is

An opt-in, separate process — like [dot-telegram](#) — that joins the Gentle Dot daemon as one more WebSocket client (`protocol v1`, access key from `~/.gentle-dot/token`) and relays one allowlisted WhatsApp conversation. Gentle Dot itself never changes. If you do not run it, it does not exist.

Design decisions (dual-provider Meta Cloud API + Baileys, Engram as memory and bridge DB) live in the study: `../Propuesta — dot-whatsapp (WhatsApp para Gentle Dot).md`.

## Status

Scaffold only: config loader, copied daemon client + protocol (from dot-telegram, MIT), ChannelTransport interface, Engram store stub. Transport and bridge land via the tasks in `odd/tasks/dot-whatsapp.md`.

## Security (phase 1, non-negotiable)

- Allowlist of E.164 numbers only; anything else is ignored and logged.
- Anti-loop: own messages, broadcasts and statuses are never relayed.
- Baileys credentials on disk with mode 700; the daemon access key is re-read from its file before every connection.
- Idempotency (Engram, `topic_key msg-<wa-id>`) so a restart never double-sends.

MIT License (c) 2026. Reuses `daemon-client.ts` / `protocol.ts` from dot-telegram (danielgap, MIT).
