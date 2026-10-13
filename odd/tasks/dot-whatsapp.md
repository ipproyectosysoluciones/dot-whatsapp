# dot-whatsapp — feature tasks

Owner: lordAstaroth · started 2026-10-13 · study doc: `../../Propuesta — dot-whatsapp (WhatsApp para Gentle Dot).md` (root of the `gentleman/` workspace)
Engram mirror topic: `dot-whatsapp-study`

## Specs

- **S1 (dual provider, owner 2026-10-13):** "dar al usuario la opción de Meta en su versión Oficial y la alternativa con Baileys" — one internal `ChannelTransport` (`start / onMessage / sendText / stop`), config switch `whatsapp.provider: baileys | meta-cloud`. Interface is *extracted* after Baileys works (no premature abstraction).
- **S2 (Engram, owner 2026-10-13):** "la memoria si se puede con engram al igual que la DB" — assistant memory = existing shared Engram; bridge DB = Engram observations (project `dot-whatsapp`): dedup `msg-<wa-id>` (duplicate_count), pinned allowlist override, liveness notes. Baileys crypto creds stay in 0700 files, never in Engram.
- **S3 (bridge pattern):** opt-in separate process, daemon ws + access key re-read per connect, backoff 1s→30s; reused from dot-telegram (`daemon-client.ts`, `protocol.ts`, MIT).
- **S4 (security, phase 1):** E.164 allowlist, anti-loop (own/status/broadcast ignored + logged), text-only DMs, no groups, no media.
- **S5 (delivery rules):** develop in own repo (fork-style), publish issue on Gentleman-Programming/gentle-dot for approval, PR only after `status:approved`; artifacts English.

## Tasks

- [x] T1 Scaffold: package, tsconfig, config.ts (E.164 allowlist), copied daemon-client/protocol, ChannelTransport interface, Engram stub, README; **pnpm via corepack** (packageManager pinned 11.5.0; npm artifacts removed 2026-10-13 per L6). tsc clean, vitest 3/3 green.
- [x] T2 Ownership: repo remoto creado **ipproyectosysoluciones/dot-whatsapp** (privado, estilo dot-telegram standalone) + push inicial — 2026-10-13; trabajo dual local+remoto (L7).
- [x] T3 Issue publicada: [gentle-dot#65](https://github.com/Gentleman-Programming/gentle-dot/issues/65) (2026-10-13, aprobada por el usuario tal cual el borrador; referencia #48).
- [ ] T4 T-spike: Baileys QR pairing on test number, echo round-trip via real WhatsApp (evidence captured).
- [ ] T5 T-bridge: inbound → daemon `send` → answer → `sendText` back; allowlist + anti-loop + Engram idempotency; offline tests (mirror dot-telegram's 88-test style).
- [ ] T6 systemd unit `dot-whatsapp.service` + runbook.
- [ ] T7 Extract `ChannelTransport` from the working Baileys impl; stub `meta-cloud` provider skeleton (Cloud API webhook notes) — proves S1 seam. PR to upstream only after issue approval.

## Log

- **L1 (2026-10-13, user):** "Tengo una propuesta y solo de estudio… MCP, o una conexión o integración de WhatsApp a gentle-dot… https://www.builderbot.app/en … De ser posible primero me creas un .md y un mermaid con la explicación de la integración"
- **L2 (2026-10-13, user):** "utilizariamos baileys y la memoria si se puede con engram al igual que la DB"
- **L3 (2026-10-13, user):** "dar al usuario la opción de Meta en su versión Oficial y la alternativa con Baileys" + BuilderBot viró a SaaS.
- **L4 (2026-10-13, decision):** develop in fork-style own repo first, formal integration via issue-first + PR after status:approved; no informal pre-consult (CONTRIBUTING already answers it; #48 precedent: prototype first, then propose with evidence).
- **L5 (2026-10-13, user philosophy):** "un proyecto se basa en estar bien claro en la documentación y arquitectura… funcionalidad y qué resuelva un problema… la aceptación esta en la funcionalidad" — spike evidence is the acceptance bar.
- **L6 (2026-10-13, user):** "utilicemos pnpm, es más debe de estar como corepack global" — package manager: corepack pnpm, packageManager field pinned in package.json; never npm/npx in this repo.
- **L7 (2026-10-13, user):** "abrir la repo nueva… trabajaremos en ambas, local y remoto" — repo github.com/ipproyectosysoluciones/dot-whatsapp (private), remote origin, initial commit 237a99c pushed; work local + remote from now on.
- **L8 (2026-10-13):** issue #65 published at Gentleman-Programming/gentle-dot (user approved the draft as-is). Tracking note mirrored in Obsidian vault belzebuth: `Gentleman/Seguimiento-issues.md` + `Gentleman/Propuesta — dot-whatsapp.md`. Next blocked item: T4 Baileys spike needs the user to scan a QR with a test number.
