# Merge Checklist - PRs #151 → #152 → #154 → #153

## Pre-requisitos
- [ ] Issue #65: `status:approved` ✅
- [ ] Todos los PRs con CI verde
- [ ] PRs apuntan a branch `dev` (no `main`)

## Orden de Merge (Dependencias)

### 1️⃣ PR #151 - Base Protocol + Daemon Proxy (GT1-GT2)
- [ ] CI verde ✅
- [ ] Review aprobado
- [ ] Merge a `dev`
- [ ] Verificar que #152 y #154 actualizan base

### 2️⃣ PR #152 - UI Channels Screen (GT3)
- [ ] Rebase sobre `dev` actualizado
- [ ] CI verde ✅
- [ ] Review aprobado
- [ ] Merge a `dev`

### 3️⃣ PR #154 - T11 Daemon Side (channel_notify)
- [ ] Rebase sobre `dev` actualizado
- [ ] CI verde ✅
- [ ] Review aprobado
- [ ] Merge a `dev`

### 4️⃣ PR #153 - Docs (GT4)
- [ ] Rebase sobre `dev` actualizado
- [ ] CI verde ✅
- [ ] Review aprobado
- [ ] Merge a `dev`

## Post-Merge
- [ ] Actualizar issue #65 con links a commits merged
- [ ] Cerrar issue #65 como completed
- [ ] Crear release branch si aplica
- [ ] Actualizar docs/UPSTREAM_SETUP.md con repo upstream real

## Comandos Útiles
```bash
# Ver estado PRs
gh pr list --repo Gentleman-Programming/gentle-dot --author ipproyectosysoluciones --state open

# Merge ordenado (ejemplo #151)
gh pr merge 151 --repo Gentleman-Programming/gentle-dot --merge --delete-branch

# Ver logs CI
gh run list --repo Gentleman-Programming/gentle-dot --limit 10
```
EOF
cat /run/media/bladimir/Datos/Datos/proyectos/work/gentleman/dot-whatsapp/docs/MERGE_CHECKLIST.md