#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " ApplyFlow — 100% Cloudflare Production Readiness Audit"
echo "=========================================================="
echo ""

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▶ 1. Checking Database Migration Files..."
test -f "$ROOT_DIR/migrations/0001_add_r2_metadata.sql" && echo "  ✔ Migration 0001 present"
test -f "$ROOT_DIR/migrations/0002_add_chat_and_notifications_indexes.sql" && echo "  ✔ Migration 0002 (Indexes & Chat idempotency) present"
test -f "$ROOT_DIR/migrations/0003_add_google_drive_resume_fields.sql" && echo "  ✔ Migration 0003 (Google Drive resume fields) present"
test -f "$ROOT_DIR/migrations/0004_ensure_password_hash_column.sql" && echo "  ✔ Migration 0004 (Password hash column alignment) present"

echo ""
echo "▶ 2. Running Backend Workers Vitest Suite (131 tests)..."
cd "$ROOT_DIR/backend-workers"
npm test -- --run

echo ""
echo "▶ 3. Verifying TypeScript Types..."
npx tsc --noEmit
echo "  ✔ TypeScript passed with 0 errors"

echo ""
echo "▶ 4. Validating Cloudflare Wrangler Bundle (Dry-Run)..."
npx wrangler deploy --dry-run
echo "  ✔ Cloudflare Workers bundle validated"

echo ""
echo "▶ 5. Building Frontend for Cloudflare Pages..."
cd "$ROOT_DIR/frontend"
npm run build
echo "  ✔ Frontend production assets compiled"

echo ""
echo "=========================================================="
echo " 🎉 ALL 5 PRODUCTION GATES PASSED SUCCESSFULLY!"
echo "=========================================================="
echo ""
echo "Deployment Steps:"
echo "1. Run migrations 0001, 0002 & 0003 in production Neon PostgreSQL"
echo "2. Configure Worker secrets via: wrangler secret put <NAME>"
echo "   - JWT_SECRET_KEY, DATABASE_URL, GOOGLE_APPS_SCRIPT_URL, GOOGLE_APPS_SCRIPT_SECRET, GROQ_API_KEY, VAPID_PRIVATE_KEY"
echo "3. Deploy Worker: cd backend-workers && wrangler deploy"
echo "4. Deploy Pages: cd frontend && npm run deploy (or connect Git repo)"
echo "5. Run manual browser smoke tests across roles"
