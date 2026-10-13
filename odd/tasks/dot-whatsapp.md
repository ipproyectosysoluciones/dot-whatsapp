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
- [x] T4 T-spike (2026-10-13, commit head on main): Baileys QR pairing into a dedicated test number + echo round-trip VERIFIED live (inbound "Hola dot" → echoed, msg-ACB5B33...). Pin baileys@6.7.24 (GHSA-qvv5-jq5g-4cgg flags 6.7.18); pnpm 11 build approvals live in pnpm-workspace.yaml; inbound filtering uses isJidUser/isLidUser.
- [x] T5 T-bridge (2026-10-13, commits en main): bridge.ts (allowlist E.164, /stop, deflexión busy, asks confirm/select/input por número, splits, label `[dot-whatsapp]`, idempotencia Engram `msg-<id>`), main.ts cableado (store Engram por CLI, fail-closed sin idempotencia; daemon client WS; transporte Baileys con jid real por remitente), test/bridge.test.ts 9 casos offline. tsc limpio, vitest 13/13.
  - **E2E EN VIVO ✅ 2026-10-13**: "hola, decime la hora y saludame" desde el personal allowlisted → daemon → asistente respondió en WhatsApp Y en la app gentle-dot. Dedup post-reconexión (code 500) verificado (`ignored: duplicate msg-…`). Fallo intermedio válido: `Agent is not ready` sin agente activo en la app.
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
- **L8 (2026-10-13):** issue #65 published (approved as-is). Tracking mirrored in Obsidian vault belzebuth: `Gentleman/Seguimiento-issues.md` + `Gentleman/Propuesta — dot-whatsapp.md`.
- **L9 (2026-10-13, spike evidence):** QR pairing succeeded on dedicated test number; first message-decrypt error + `init queries` 408 right after pairing (transient, known post-pair sync); echo confirmed from a second number (`inbound from=… text=\"Hola dot\"` → `echoed msg-ACB5B33…`). GOTCHA: the "Message yourself" self-chat did NOT deliver messages.upsert for own texts in this setup — test 1:1 from a second number instead. self-chat sends arrive with fromMe=true → anti-loop must key off fromMe + echo prefix, not JID alone (lid vs pn JID: WhatsApp now routes some via @lid; use isJidUser/isLidUser). Dependabot flags 8 vulnerabilities (1 high) in scaffold deps — `pnpm audit` at high+ passes (6.7.24 pin), remaining are transitive-moderate.
- **L10 (2026-10-13):** replies go to the last allowlisted sender (phase 1). Proactive outreach (assistant notifies unprompted) = phase 2, cf. #48's "reach you" argument.
- **L11 (2026-10-13):** the registered Business number IS THE BOT: messages typed in its own app arrive with fromMe=true and the anti-loop drops them; also self-chat upserts are unreliable (L9). In Baileys, own-account sends ALWAYS carry fromMe=true — there is no "I'm talking to the bot" signal from that device. Supported phase-1 lane: personal → bot → assistant → personal.
