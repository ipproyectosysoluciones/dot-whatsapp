# dot-whatsapp — runbook del servicio

Puente WhatsApp ↔ Gentle Dot como servicio de usuario (systemd `--user`; linger habilitado, sobrevive al logout).

## Instalación (una vez)

```bash
# 1. Unit ya creado en ~/.config/systemd/user/dot-whatsapp.service

# 2. Credenciales en .env (gitignored, 600). Contenido mínimo:
#    DOT_WHATSAPP_ALLOWED_NUMBERS=549XXXXXXXXXX    (tu número personal, E.164 sin +)
#    DOT_WHATSAPP_PROVIDER=baileys                 (default; "meta-cloud" = stub oficial, fase 2)
#    (opcionales: GENTLE_DOT_URL, DOT_WHATSAPP_AUTH_DIR, ENGRAM_URL)

# 3. Pairing del número del bot (una vez, diario dirigido):
cd /run/media/bladimir/Datos/Datos/proyectos/work/gentleman/dot-whatsapp
corepack pnpm install
DOT_WHATSAPP_ALLOWED_NUMBERS=549XXXXXXXXXX node src/main.ts
# aparece el QR → WhatsApp del bot → Dispositivos vinculados → escanear
# Ctrl+C cuando diga "listening". Credenciales quedan en ~/.dot-whatsapp/auth (700)

# 4. Habilitar y arrancar:
systemctl --user daemon-reload
systemctl --user enable --now dot-whatsapp.service
systemctl --user status dot-whatsapp.service
```

## Operación

| Acción | Comando |
| --- | --- |
| Logs en vivo | `journalctl --user -u dot-whatsapp -f` |
| Estado | `systemctl --user status dot-whatsapp` |
| Reiniciar | `systemctl --user restart dot-whatsapp` |
| Parar | `systemctl --user stop dot-whatsapp` |

## Troubleshooting

| Síntoma | Causa | Acción |
| --- | --- | --- |
| `logged out` | WhatsApp desvinculó (o Meta reseteó sesiones) | `systemctl --user stop dot-whatsapp`; `rm -rf ~/.dot-whatsapp/auth`; re-pairing paso 3 |
| `Agent is not ready` en daemon.log | gentle-dot sin agente activo | abrir la app de Gentle Dot; el mensaje se perdió, reenviar |
| sin respuesta | daemon caído | verificar `curl http://127.0.0.1:4317/` (200); el bridge reconecta solo |
| mendajes duplicados del asistente | nunca esperado — Engram dedup falló | revisar `engram doctor`; reportar |

## Reglas de oro

- El número Business registrado **es el bot**: se le escribe **a** él, no **desde** él (sus propios mensajes son `fromMe` y se ignoran; fase 1).
- Respuestas van al último remitente allowlisted.
- Números nuevos: agregar a `DOT_WHATSAPP_ALLOWED_NUMBERS` + `systemctl --user restart dot-whatsapp`.
- Anti-spam natural: tráfico humano únicamente (Meta ban risk en clientes no oficiales).
- **La allowlist vive en `~/.dot-whatsapp/allowlist.json` (0600)**: es la fuente de verdad desde el primer boot — el env `DOT_WHATSAPP_ALLOWED_NUMBERS` solo siembra; agregar/quitar desde el panel o la API persiste ahí y sobrevive reinicios. Una lista vacía intencional se respeta (el puente corre pero nadie puede escribir); un archivo corrupto cae al env con log.
