# Discord Announcement - Final Template (Español)

## 📢 Para canal #general o #anuncios

---

**Título:** 🎉 **dot-whatsapp v0.1.0 - Gentle Dot ahora en WhatsApp!** 🎉

---

**Mensaje:**

@everyone 🎉 **¡dot-whatsapp v0.1.0 ya está disponible!**

Nos emociona traer **Gentle Dot a WhatsApp** con nuestro primer release prototype.

## 🚀 **¿Qué es dot-whatsapp?**
Un bridge opt-in que conecta tu WhatsApp con Gentle Dot. Corre como systemd user service, se conecta vía WebSocket (protocolo v1) y **Gentle Dot no cambia nada**.

## ✨ **Features Principales**

| Feature | Descripción |
|---------|-------------|
| 🤖 **Dual Provider** | Baileys (QR, gratis) + Meta Cloud API (oficial) |
| 🔒 **Seguridad** | Allowlist E.164, anti-loop, credenciales 0700/0600, idempotencia Engram |
| 📱 **Admin API** | Panel Channels: QR pairing, allowlist hot-reload, verify, unpair |
| 🔔 **Outreach Proactivo** | `channel_notify`: recordatorios, alertas, resúmenes sin prompt |
| ⚡ **Rate Limiting** | Token bucket 1000/día + backoff exponencial (1s→60s) |
| 🛡️ **HMAC Audit** | 14 tests timing-safe, validación estricta |

## 🧪 **Calidad**
- ✅ 88/88 tests bridge
- ✅ 14/14 tests HMAC audit
- ✅ TypeScript strict, zero `any`
- ✅ v0.1.0 tagged + CHANGELOG + artifacts

## 🔗 **Links**
- **Repo:** https://github.com/ipproyectosysoluciones/dot-whatsapp
- **Release v0.1.0:** https://github.com/ipproyectosysoluciones/dot-whatsapp/releases/tag/v0.1.0
- **Issue principal:** https://github.com/Gentleman-Programming/gentle-dot/issues/65
- **PRs Daemon:** #151 #152 #153 #154 (chained, esperando review)

## ⚠️ **Disclaimer**
**PROTOTIPO** - Protocolo v1 no publicado. Baileys = no oficial, número dedicado, riesgo ban. Meta Cloud = Business verificado + webhook HTTPS público.

## 🚀 **Quick Start**
```bash
git clone https://github.com/ipproyectosysoluciones/dot-whatsapp.git
cd dot-whatsapp && pnpm install --frozen-lockfile
cp .env.example .env  # Configurar
pnpm start:env        # QR pairing Baileys
systemctl --user enable --now dot-whatsapp.service
```

## 📖 **Docs**
- RUNBOOK.md - Operaciones
- CHANGELOG.md - Historial
- UPSTREAM_SETUP.md - Setup repo org

---

⚠️ **PROTOTIPO** - Usar número dedicado, volumen humano. Ver study para riesgo ban.

**¡Pruebenlo y cuéntenos!** 🚀 Preguntas en #dot-whatsapp (próximamente) o en gentle-dot#65.

---

**Equipo Gentleman-Programming** 🌹
*Built with Gentle-AI*
EOF
cat /run/media/bladimir/Datos/Datos/proyectos/work/gentleman/dot-whatsapp/docs/DISCORD_ANNOUNCEMENT.md