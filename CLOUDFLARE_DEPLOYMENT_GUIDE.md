# ApplyFlow — 100% Cloudflare Native Production Deployment Guide

This guide details the complete deployment sequence, secrets configuration, database migrations, and production verification for ApplyFlow's 100% Cloudflare-native architecture.

---

## 1. Production Architecture Overview

| Component | Cloudflare / Managed Service | Responsibility |
| :--- | :--- | :--- |
| **Frontend** | **Cloudflare Pages** | React 18 + Vite SPA, edge routing, global CDN caching |
| **Backend API** | **Cloudflare Workers** | Hono TypeScript edge worker, sub-millisecond cold starts |
| **Real-Time Chat** | **Cloudflare Durable Objects** | Co-located room WebSockets, presence, typing, 30s heartbeats, message replay |
| **File Storage** | **Cloudflare R2** | Private resume storage, zero egress fees, SHA-256 deduplication |
| **Database** | **Neon PostgreSQL** | Serverless relational store, absolute source of truth for all business state |
| **Cron Triggers** | **Workers Scheduled Events** | Daily 03:00 UTC expired resume retention cleanup (120 days) |
| **Observability** | **Worker `x-request-id`** | Distributed tracing across Workers, Neon, and client logs |

```
[ Browser / Client ]
       │
       ├───► [Cloudflare Pages] (applyflow.pages.dev / custom domain)
       │            │
       │            ▼ (HTTP-only JWT Cookie Authentication)
       ├───► [Cloudflare Workers] (Hono Serverless API)
       │            │
       │            ├───► [Cloudflare Durable Objects] (ChatRoomDO: WebSockets, Presence, Replay)
       │            │
       │            ├───► [Neon PostgreSQL] (Source of Truth: Relational Data, Messages, Audits)
       │            │
       │            └───► [Cloudflare R2] (Private Resume Object Storage: applyflow-resumes)
       │
       └───► [Web Push Service] (VAPID Push Notifications for Offline Recipients)
```

---

## 2. Pre-Deployment Readiness Check

Run the automated production readiness audit in the repository root:

```bash
./scripts/verify-production-readiness.sh
```

This verifies:
1. Database migration files `0001` and `0002` are present.
2. Vitest test suite passes (127 / 127 tests).
3. TypeScript compiler validates with 0 errors (`tsc --noEmit`).
4. Wrangler deploy bundle validates in dry-run mode (`wrangler deploy --dry-run`).
5. Frontend production assets compile cleanly (`vite build`).

---

## 3. Four-Phase Production Deployment Checklist

### Phase 1 — Cloudflare Infrastructure Setup

1. **Create Cloudflare Pages Project**:
   - In Cloudflare Dashboard, go to **Workers & Pages** > **Create application** > **Pages**.
   - Connect your GitHub repository: `harishE-coder/ApplyFlowForCloudflare`.
   - Build settings:
     - **Framework preset:** Vite
     - **Build command:** `npm run build`
     - **Build output directory:** `dist`
     - **Root directory:** `frontend`
   - Set environment variable: `VITE_API_BASE_URL` to your Worker URL (or leave blank if routed under same domain via Cloudflare routes).

2. **Create Cloudflare R2 Bucket**:
   - In Cloudflare Dashboard, go to **R2 Object Storage** > **Create bucket**.
   - Bucket name: `applyflow-resumes`.
   - Keep bucket private (all downloads and previews are securely streamed through authorization-checked Worker routes).

3. **Verify Durable Object Binding**:
   - Configured in `backend-workers/wrangler.toml`:
     ```toml
     [durable_objects]
     bindings = [
       { name = "CHAT_ROOMS", class_name = "ChatRoomDO" }
     ]

     [[migrations]]
     tag = "v1"
     new_classes = ["ChatRoomDO"]
     ```

4. **Custom Domain & Strict SSL**:
   - In Cloudflare Dashboard > **SSL/TLS** > Set mode to **Full (strict)**.
   - Bind custom domains (e.g. `applyflow.yourdomain.com` for Pages and `api.yourdomain.com` for Workers).

---

### Phase 2 — Neon PostgreSQL Database Migrations

Apply the migration scripts sequentially against your production Neon PostgreSQL instance:

```bash
# 1. Run R2 metadata migration
psql "$NEON_DATABASE_URL" -f migrations/0001_add_r2_metadata.sql

# 2. Run Chat & Notifications performance indexes migration
psql "$NEON_DATABASE_URL" -f migrations/0002_add_chat_and_notifications_indexes.sql
```

**Indexes Created:**
- `ix_resumes_r2_key` on `resumes(r2_key)`
- `ix_resumes_expires_at` on `resumes(expires_at)`
- `ix_notifications_user_unread` on `notifications(user_id, is_read)` (O(1) navbar badge)
- `ix_chat_messages_room_created` on `chat_messages(room_id, created_at DESC)` (instant room load)
- `ix_chat_messages_client_id` on `chat_messages(room_id, client_message_id)` (message idempotency)

---

### Phase 3 — Worker Secrets Configuration

Navigate to `backend-workers/` and configure production secrets using the Wrangler CLI:

```bash
cd backend-workers

# 1. JWT signing secret (use 32+ character random string)
wrangler secret put JWT_SECRET_KEY

# 2. Production Neon Serverless PostgreSQL connection string
wrangler secret put DATABASE_URL

# 3. Primary AI classification key (Groq for ultra-fast intake)
wrangler secret put GROQ_API_KEY

# 4. Optional secondary AI keys for multi-provider switching
wrangler secret put OPENAI_API_KEY
wrangler secret put GEMINI_API_KEY

# 5. Web Push notification keys
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
```

**Deploy the Worker:**
```bash
npx wrangler deploy
```

---

### Phase 4 — Production Browser Smoke Test Matrix

Perform these tests manually in the deployed browser environment to validate all subsystems:

| Area | Action / Flow | Expected Result | Verified |
| :--- | :--- | :--- | :---: |
| **Auth** | Login with valid credentials | 200 OK, HTTP-only `access_token` and `refresh_token` set | [ ] |
| **Session** | Refresh browser (`F5` / `Cmd+R`) | Stays authenticated via `/api/auth/bootstrap`, navbar loads | [ ] |
| **Auth Guard** | Click Logout | Cookies cleared with `Max-Age=0`, subsequent API calls return 401 | [ ] |
| **Clients** | Create Client in Clients table | New client persisted in Neon, reflected immediately in table | [ ] |
| **Resumes** | Upload PDF resume | File deduplicated by SHA-256, stored in R2, metadata in Neon | [ ] |
| **Storage** | Preview & Download resume | Authorized streaming through Worker, correct headers | [ ] |
| **Requirements** | Create Job Requirement | Form submits successfully, status defaults to `active` | [ ] |
| **Intake AI** | Submit candidate intake / email | AI provider processes text, classifies, and returns structured data | [ ] |
| **Attendance** | Check-in / Check-out | Guard prevents duplicate active check-ins (409); hours calculated | [ ] |
| **Targets** | View recruiter targets & progress | Progress calculated via SQL aggregation; past effective dates protected | [ ] |
| **Chat Sockets** | Open chat in 2 browser windows | WebSocket upgrades via JWT cookie; live messages sync instantly | [ ] |
| **Chat Reconnect** | Toggle Wi-Fi off for 15s then on | Reconnects automatically; missing messages replayed without duplication | [ ] |
| **Offline Push** | Send message to offline user | Offline check succeeds; push notification dispatched | [ ] |
| **Observability** | Inspect Network tab headers | Every response includes `X-Request-Id` for distributed log correlation | [ ] |

---

## 4. Operational Cost Model

For production scale of **20 Clients × ~30 Resumes/day = ~600 Resumes/day** (~70 KB average PDF):

| Resource | Usage at Scale | Cloudflare Free Tier | Surplus Margin |
| :--- | :--- | :--- | :--- |
| **Cloudflare R2** | ~1.2 GB/month new storage (~4.8 GB with 120-day retention) | 10 GB storage free | **52% buffer** within 100% Free tier |
| **R2 Operations** | ~18,000 Class A writes/mo, ~50,000 Class B reads/mo | 1,000,000 Class A / 10,000,000 Class B free | **98%+ free headroom** |
| **Neon PostgreSQL** | ~20 MB metadata/month | 0.5 GB free storage | Free tier sufficient for years of metadata |
| **Workers Requests** | ~150,000 requests/day | 100,000/day free or $5/mo Workers Paid (10M requests) | Negligible cost ($0 - $5/mo) |
| **Cloudflare Pages** | Unlimited static requests & global CDN | Included free | **$0 / month** |

---

## 5. Cutover & Rollback Window

1. **Parallel Run**: Keep the existing FastAPI service running in read-only / standby mode during the initial 48-hour cutover.
2. **DNS Switch**: Point `api.yourdomain.com` to the Cloudflare Worker.
3. **Rollback Contingency**: If an unforeseen issue arises, changing DNS back to the FastAPI container restores service in under 60 seconds without data loss, since Neon PostgreSQL remains the single shared source of truth.
4. **FastAPI Decommission**: After 7 consecutive days of stable production metrics on Cloudflare Workers, archive the FastAPI backend.
