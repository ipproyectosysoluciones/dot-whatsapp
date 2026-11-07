# Security Policy

dot-whatsapp is a security-sensitive component by design: it carries private
conversations between WhatsApp and the Gentle Dot daemon. This document states
what is supported, how to report vulnerabilities, and the guarantees the bridge
makes (and does not make) today.

## Supported state

This is a **prototype bridge running on a single user's machine** (`main` of this
repository, deployed via the systemd user unit in `docs/dot-whatsapp.service`).
There are no long-term support branches: only the latest commit of `main` (and
open pull requests against it) receives fixes.

## Reporting a vulnerability

**Do not open a public issue for a security report.**

Use GitHub's private vulnerability reporting on this repository
(**Security → Report a vulnerability**), or contact the maintainer directly
(**Bladimir (@lordastaroth)**, owner of record). Include:

- the affected component (`src/bridge.ts`, `src/admin-api.ts`,
  `src/meta-cloud-transport.ts`, `src/rate-limit.ts`, workflows, …),
- the impact a successful exploit would have,
- a minimal reproduction or proof of concept.

You will get an acknowledgement within 7 days and a fix or a documented
mitigation plan once the report is triaged. Coordinated disclosure is the
default: we ask for a 90-day window before public detail.

## Security posture (phase 1, non-negotiable)

The bridge is opt-in and defensive by default:

- **E.164 allowlist.** Only explicitly authorized numbers are relayed;
  everything else is ignored and logged. The list lives in
  `~/.dot-whatsapp/allowlist.json` (mode `0600`); full digits never reach Engram
  or the admin API responses (masked to the last 4 digits server-side).
- **Anti-loop.** Own messages (`fromMe`), broadcasts, statuses, and non-text
  content are never relayed.
- **Admin API.** Binds to `127.0.0.1` only; Bearer token read from
  `~/.dot-whatsapp/admin-token` (`0600`), re-read on every request so rotation
  needs no restart.
- **Meta Cloud webhook.** `X-Hub-Signature-256` validated with a timing-safe
  comparison; payloads are processed only after validation. Config is
  fail-closed: missing `DOT_WHATSAPP_META_*` variables disable the transport.
- **Baileys credentials.** Stored on disk with mode `0700`; never uploaded,
  logged, or mirrored into Engram.
- **Daemon link.** The daemon access key is re-read before every WebSocket
  connection.
- **Outbound rate limiting.** Per-number token bucket, bounded retries
  (`maxAttempts`, default 5) with honored exponential backoff; failed sends are
  retried through the queue instead of being silently lost, and only the
  undelivered tail of a multi-chunk message is ever resent.

## Known limitations (by design, phase 1)

- Text-only: no media, no groups, no templates.
- One assistant conversation lane: personal (allowlisted) → bridge → daemon →
  reply to the same sender.
- The bridge never initiates conversations on its own; only the daemon can fire
  proactive `channel_notify` deliveries, and they pass the same allowlist.

## Dependency policy

Dependency build scripts are approved explicitly in `pnpm-workspace.yaml`
(`allowBuilds`) and version pins that address advisories live in
`overrides` (same file) — pnpm 11 ignores the legacy `package.json#pnpm` field.
CI installs with `--frozen-lockfile`, so any dependency change must update
`pnpm-lock.yaml` in the same change. Known advisories (e.g. the
`follow-redirects` cross-realm header issue, GHSA high, fixed by pinning
1.16.2) are closed in-tree rather than by ignoring the alert.
