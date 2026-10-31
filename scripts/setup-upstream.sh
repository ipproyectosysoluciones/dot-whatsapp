#!/usr/bin/env bash
# Setup upstream repo: Gentleman-Programming/dot-whatsapp
# Run as admin of Gentleman-Programming org

set -euo pipefail

REPO_NAME="dot-whatsapp"
ORG="Gentleman-Programming"
SOURCE_DIR="/run/media/bladimir/Datos/Datos/proyectos/work/gentleman/dot-whatsapp"

echo "🚀 Setting up upstream repo: ${ORG}/${REPO_NAME}"

# 1. Create repo in org
echo "📦 Creating repo in ${ORG}..."
gh repo create "${ORG}/${REPO_NAME}" \
  --private \
  --description "Opt-in WhatsApp bridge for the Gentle Dot assistant (prototype)" \
  --source="${SOURCE_DIR}" \
  --push

# 2. Configure branch protection
echo "🛡️ Configuring branch protection..."
gh api repos/"${ORG}"/"${REPO_NAME}"/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["test","typecheck"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}'

# 3. Add secrets (replace with actual values)
echo "🔐 Adding secrets (update with real values)..."
# gh secret set META_APP_ID --repo "${ORG}/${REPO_NAME}" --body "YOUR_APP_ID"
# gh secret set META_APP_SECRET --repo "${ORG}/${REPO_NAME}" --body "YOUR_APP_SECRET"
# gh secret set META_VERIFY_TOKEN --repo "${ORG}/${REPO_NAME}" --body "YOUR_VERIFY_TOKEN"
# gh secret set META_PHONE_NUMBER_ID --repo "${ORG}/${REPO_NAME}" --body "YOUR_PHONE_NUMBER_ID"
# gh secret set META_TOKEN --repo "${ORG}/${REPO_NAME}" --body "YOUR_META_TOKEN"
gh secret set ENGRAM_URL --repo "${ORG}/${REPO_NAME}" --body "http://localhost:47821"
gh secret set GENTLE_DOT_URL --repo "${ORG}/${REPO_NAME}" --body "ws://localhost:4317/ws"

# 4. Enable Actions
echo "⚙️ Enabling Actions..."
gh api repos/"${ORG}"/"${REPO_NAME}"/actions/permissions \
  --method PUT --field enabled=true --field allowed_actions="all"

# 5. Verify release
echo "✅ Verifying release..."
gh release view v0.1.0 --repo "${ORG}/${REPO_NAME}"

echo "🎉 Upstream setup complete!"
echo "Repo: https://github.com/${ORG}/${REPO_NAME}"
EOF
chmod +x /run/media/bladimir/Datos/Datos/proyectos/work/gentleman/dot-whatsapp/scripts/setup-upstream.sh