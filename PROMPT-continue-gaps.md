# Prompt: Continue dot-whatsapp gaps (P0/P1)

## Contexto
- Bridge: dot-whatsapp/main (e18bc22) — T1–T11 ✅ 74/74 tests
- Daemon: gentle-dot-beta/feat/channels-ux — GT1–GT5 ✅
- 4 PRs upstream: gentle-dot #151–#154 (chained)
- Repo upstream Gentleman-Programming/dot-whatsapp **no existe aún**

## Objetivo
Cerrar gaps P0/P1 antes de que reviewers terminen PRs #151–#154.

---

## Tareas ordenadas (ejecutar en secuencia)

### P0-1: Test E2E bridge→daemon (`channel_notify` flow)
**Ubicación**: gentle-dot-beta (daemon + bridge juntos)
**Qué hacer**:
1. Levantar bridge (dot-whatsapp) + daemon (gentle-dot-beta) en docker-compose local
2. Enviar `channel_notify` desde bridge → verificar que daemon lo recibe y reenvía a UI
3. Agregar test automatizado en `packages/daemon/test/channel-e2e.test.ts`
4. CI: workflow que levante ambos y corra el test

**Evidencia esperada**: Logs "channel_notify received" + UI notification render

---

### P0-2: Documentar setup Meta Cloud credentials
**Archivos**: `README.md` + `RUNBOOK.md` (nuevo)
**Qué documentar**:
- Meta App ID / App Secret / Business Account ID / Phone Number ID
- Webhook URL + Verify Token
- Permanent Token vs System User Token
- Cómo generar en Meta Business Manager
- Variables de entorno requeridas
- Validación al inicio del bridge (fail-fast si faltan)

---

### P0-3: Crear repo upstream Gentleman-Programming/dot-whatsapp
**Pasos**:
```bash
# En GitHub UI o gh CLI
gh repo create Gentleman-Programming/dot-whatsapp --private --source=. --push
# Configurar branch protection: main requires PR + status checks
# Configurar CI: GitHub Actions (test + typecheck + build)
# Agregar secrets: META_APP_ID, META_APP_SECRET, etc.
```

---

### P1-1: Rate limit queue + retry exponencial
**Archivo**: `src/rate-limit.ts` (nuevo) + integración en `src/bridge.ts`
**Spec**:
- Queue en memoria (Map<phone, Message[]>)
- Token bucket: 1000 msg/día base tier
- Retry: exponencial 1s, 2s, 4s, 8s, max 60s
- Métricas: `rate_limit_hits`, `queue_depth`, `retry_count`
- Log cuando se acerca al límite (80%)

---

### P1-2: Webhook HMAC verification audit
**Archivo**: `src/webhook.ts`
**Verificar**:
- `X-Hub-Signature-256` header presente
- HMAC-SHA256(body, app_secret) === header
- Rechazar con 401 si no match
- Timing-safe comparison
- Test unitario con payloads válidos/inválidos

---

## Cómo trabajar

1. **Una tarea a la vez** — marcar completada antes de pasar a la siguiente
2. **Commits atómicos** — Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`)
3. **Tests + typecheck** después de cada cambio (`pnpm test && pnpm typecheck`)
4. **Push a rama feature** — no a main directamente
5. **Actualizar este archivo** marcando ✅ cuando termines cada item

---

## Estado actual

| Task | Status | Branch | Notes |
|------|--------|--------|-------|
| P0-1 Test E2E | 🔄 Pendiente | feat/e2e-channel-notify | |
| P0-2 Doc Meta creds | 🔄 Pendiente | docs/meta-credentials | |
| P0-3 Repo upstream | 🔄 Pendiente | chore/repo-setup | |
| P1-1 Rate limit | 🔄 Pendiente | feat/rate-limit | |
| P1-2 Webhook HMAC | 🔄 Pendiente | fix/webhook-hmac | |

---

## Comandos útiles

```bash
# Test bridge
cd /run/media/bladimir/Datos/Datos/proyectos/work/gentleman/dot-whatsapp
pnpm test && pnpm typecheck

# Test daemon (gentle-dot-beta)
cd /run/media/bladimir/Datos/Datos/proyectos/work/gentleman/gentle-dot
pnpm test packages/daemon/test/channel-proxy.test.ts packages/daemon/test/channel-notify.test.ts

# Typecheck all
pnpm typecheck

# Docker compose para E2E (crear docker-compose.yml)
docker-compose -f docker-compose.e2e.yml up --build
```

---

## Notas para Discord/Gmail (paralelo)

Cuando termines P0-P1, el bridge pattern está listo para replicar:
- `dot-discord` → nuevo repo, mismo protocolo `channel_notify` + eventos Discord
- `dot-gmail` → watch Gmail API → push `channel_notify` / `message_create`

El contrato `channel_notify` ya está en protocolo v1 (PR #151 + #154).

---

**¡Dale!** Empezar por P0-1 (test E2E) que desbloquea todo lo demás.