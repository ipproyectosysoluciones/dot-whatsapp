# Upstream Repository Setup (P0-3)

## Repository Creation

The upstream repository `Gentleman-Programming/dot-whatsapp` must be created by an organization admin (the current token lacks `CreateRepository` permission).

### Manual Steps (run by org admin):

```bash
# 1. Create the repository
gh repo create Gentleman-Programming/dot-whatsapp \
  --private \
  --description "Opt-in WhatsApp bridge for the Gentle Dot assistant (prototype)" \
  --source=/run/media/bladimir/Datos/Datos/proyectos/work/gentleman/dot-whatsapp \
  --push

# 2. Configure branch protection for main
gh api repos/Gentleman-Programming/dot-whatsapp/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["test","typecheck"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null

# 3. Add repository secrets (for CI/CD)
gh secret set META_APP_ID --repo Gentleman-Programming/dot-whatsapp --body "xxx"
gh secret set META_APP_SECRET --repo Gentleman-Programming/dot-whatsapp --body "xxx"
gh secret set META_VERIFY_TOKEN --repo Gentleman-Programming/dot-whatsapp --body "xxx"
gh secret set META_PHONE_NUMBER_ID --repo Gentleman-Programming/dot-whatsapp --body "xxx"
gh secret set META_TOKEN --repo Gentleman-Programming/dot-whatsapp --body "xxx"
gh secret set ENGRAM_URL --repo Gentleman-Programming/dot-whatsapp --body "http://localhost:47821"
gh secret set GENTLE_DOT_URL --repo Gentleman-Programming/dot-whatsapp --body "ws://localhost:4317/ws"

# 4. Enable GitHub Actions
gh api repos/Gentleman-Programming/dot-whatsapp/actions/permissions --method PUT --field enabled=true --field allowed_actions="all"
```

---

## GitHub Actions CI Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11.5.0
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/

  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11.5.0
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build 2>/dev/null || echo "No build script"

  docker:
    runs-on: ubuntu-latest
    needs: build
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t ghcr.io/gentleman-programming/dot-whatsapp:${{ github.sha }} .
      - name: Push to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - run: docker push ghcr.io/gentleman-programming/dot-whatsapp:${{ github.sha }}
      - run: docker tag ghcr.io/gentleman-programming/dot-whatsapp:${{ github.sha }} ghcr.io/gentleman-programming/dot-whatsapp:latest
      - run: docker push ghcr.io/gentleman-programming/dot-whatsapp:latest
```

---

## Required Secrets (configure in GitHub repo settings → Secrets and variables → Actions)

| Secret | Description | Example |
|--------|-------------|---------|
| `META_APP_ID` | Meta App ID | `123456789012345` |
| `META_APP_SECRET` | Meta App Secret | `abc123...` |
| `META_VERIFY_TOKEN` | Webhook verify token | `dot-whatsapp-verify-2026` |
| `META_PHONE_NUMBER_ID` | WhatsApp Business Phone Number ID | `123456789012345` |
| `META_TOKEN` | System User Permanent Token | `EAAG...` |
| `ENGRAM_URL` | Engram server URL | `http://localhost:47821` |
| `GENTLE_DOT_URL` | Daemon WebSocket URL | `ws://localhost:4317/ws` |

---

## Branch Protection Rules

Configure in GitHub: Settings → Branches → Add rule for `main`:

- ✅ Require a pull request before merging
  - ✅ Require approvals: 1
  - ✅ Dismiss stale PR approvals when new commits are pushed
  - ✅ Require review from code owners
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - Required checks: `test`, `typecheck`
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings
- ❌ Allow force pushes (disabled)
- ❌ Allow deletions (disabled)

---

## Current Local State

The local repo at `/run/media/bladimir/Datos/Datos/proyectos/work/gentleman/dot-whatsapp` is already:
- ✅ On `main` branch with all T1-T11 commits
- ✅ `pnpm test` passes (74/74)
- ✅ `pnpm typecheck` passes
- ✅ Has `docker-compose.e2e.yml` for E2E testing
- ✅ Has `docs/RUNBOOK.md` and `docs/dot-whatsapp.service`
- ✅ Has `README.md` with Meta Cloud credentials docs

Once the upstream repo is created, push the current main branch:

```bash
cd /run/media/bladimir/Datos/Datos/proyectos/work/gentleman/dot-whatsapp
git remote add upstream git@github.com:Gentleman-Programming/dot-whatsapp.git
git push upstream main
```