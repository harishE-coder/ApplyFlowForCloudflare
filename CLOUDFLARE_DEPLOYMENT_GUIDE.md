# Cloudflare Hybrid Deployment Guide — ApplyFlow

This guide provides step-by-step instructions for deploying ApplyFlow using the **Cloudflare Hybrid Architecture**:

* **Frontend:** Cloudflare Pages (Vite + React SPA)
* **Backend:** FastAPI on Render / Railway / Fly.io (with 100% preservation of SQLAlchemy 2.0 asyncpg, AI/ML pipelines, ReportLab PDF, and Web Push)
* **Database:** Neon PostgreSQL (Serverless PostgreSQL with R2 metadata)
* **Resume Storage:** Cloudflare R2 (S3-compatible zero-egress fee storage with presigned URLs & automated retention cleanup)
* **Edge Layer:** Cloudflare DNS, Full (Strict) SSL, CDN, WAF, and Edge Caching

---

## Architecture Overview

```
[Browser / User]
       │
       ├───► [Cloudflare Pages] (Static Assets, React Router SPA, Edge CDN)
       │            │
       │            ▼
       ├───► [Cloudflare DNS / Proxy] (api.yourdomain.com / SSL Strict)
       │            │
       │            ▼
       │     [FastAPI Backend] (Render / Railway / Fly.io Container)
       │            │
       │            ├───► [Neon PostgreSQL] (Users, Clients, Apps, R2 Metadata)
       │            │
       │            └───► [Cloudflare R2 API] (Direct Uploads & Presigned URLs)
       │
       └───► [Cloudflare R2 Presigned CDN] (Direct PDF Previews & Downloads)
```

---

## Step 1: Cloudflare R2 Bucket Setup (Resume Storage)

Cloudflare R2 provides S3-compatible object storage with **zero egress fees**.

### 1.1 Create R2 Bucket
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left navigation, select **R2 Object Storage** > **Overview**.
3. Click **Create bucket**.
4. Name the bucket: `applyflow-resumes`.
5. Select **Automatic** location or your preferred region.
6. Click **Create Bucket**.

### 1.2 Generate S3-Compatible API Credentials
1. In the R2 Overview page, click **Manage R2 API Tokens** on the right side.
2. Click **Create API token**.
3. Configure the token:
   * **Token name:** `applyflow-backend-token`
   * **Permissions:** **Object Read & Write**
   * **Apply to specific buckets:** Select `applyflow-resumes`
   * **TTL:** Set to indefinite or your preferred rotation policy.
4. Click **Create API Token**.
5. **Save the generated credentials securely:**
   * **Access Key ID:** `R2_ACCESS_KEY_ID`
   * **Secret Access Key:** `R2_SECRET_ACCESS_KEY`
   * **Endpoint URL:** `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (note the `<ACCOUNT_ID>`)

### 1.3 Configure CORS for R2 Bucket (Required for Presigned URLs)
1. In the Cloudflare Dashboard, open your bucket `applyflow-resumes` > **Settings** tab.
2. Scroll to **CORS Policy** and click **Add CORS policy**.
3. Paste the following JSON:
```json
[
  {
    "AllowedOrigins": [
      "https://*.pages.dev",
      "https://yourdomain.com",
      "http://localhost:5173"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Type",
      "Content-Disposition"
    ],
    "MaxAgeSeconds": 3600
  }
]
```
4. Click **Save**.

---

## Step 2: Neon PostgreSQL Database Migration

ApplyFlow uses Neon Serverless PostgreSQL. Ensure the R2 metadata columns exist.

### 2.1 Run SQL Migration
Connect to your Neon database using your SQL client (e.g., `psql`, DBeaver, or Neon SQL Console) and execute [`migrations/0001_add_r2_metadata.sql`](file:///Users/harish/Downloads/ApplyFlow/migrations/0001_add_r2_metadata.sql):

```sql
-- Migration: Add Cloudflare R2 object storage metadata and retention fields
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS r2_key VARCHAR(500);
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS content_type VARCHAR(100) DEFAULT 'application/pdf';
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Create indices for fast R2 key lookups and retention cleanup
CREATE INDEX IF NOT EXISTS ix_resumes_r2_key ON resumes(r2_key);
CREATE INDEX IF NOT EXISTS ix_resumes_expires_at ON resumes(expires_at);
```

*(Note: ApplyFlow's backend startup lifecycle also automatically executes schema checks to verify these columns exist).*

---

## Step 3: Backend Deployment (Render or Railway)

Deploy the FastAPI container on Render, Railway, or Fly.io with Cloudflare DNS.

### 3.1 Option A: Render Deployment
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** > **Web Service**.
3. Connect your GitHub repository (`ApplyFlow`).
4. Configure service settings:
   * **Name:** `applyflow-api`
   * **Root Directory:** `backend`
   * **Runtime:** `Python 3`
   * **Build Command:** `pip install -r requirements.txt`
   * **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2`
   * **Instance Type:** Starter or Standard (1GB - 2GB RAM recommended for ML models)

5. Add Environment Variables in Render:
   | Variable | Value / Description |
   |---|---|
   | `DATABASE_URL` | `postgresql+asyncpg://<user>:<password>@<neon-host>/applyflow?ssl=require` |
   | `USE_SQLITE` | `false` |
   | `JWT_SECRET_KEY` | Generate a 64-character random string (`openssl rand -hex 32`) |
   | `JWT_ALGORITHM` | `HS256` |
   | `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` |
   | `REFRESH_TOKEN_EXPIRE_DAYS` | `7` |
   | `FRONTEND_URL` | `https://applyflow.pages.dev` (or your custom domain) |
   | `APP_CORS_ORIGINS` | `https://applyflow.pages.dev,https://yourdomain.com,http://localhost:5173` |
   | `R2_ACCOUNT_ID` | Your Cloudflare Account ID |
   | `R2_ACCESS_KEY_ID` | Your R2 API Token Access Key |
   | `R2_SECRET_ACCESS_KEY` | Your R2 API Token Secret Key |
   | `R2_BUCKET_NAME` | `applyflow-resumes` |
   | `RESUME_RETENTION_DAYS` | `120` |
   | `GROQ_API_KEY_1` | Your Groq API key |
   | `ADMIN_EMAIL` | `admin@applyflow.com` |
   | `ADMIN_PASSWORD` | `SecureAdminPass2026!` |

### 3.2 Option B: Railway Deployment
1. In Railway, click **New Project** > **Deploy from GitHub repo**.
2. Set Root Directory to `/backend`.
3. Set Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2`.
4. Add the environment variables listed in the table above under the **Variables** tab.

---

## Step 4: Frontend Deployment (Cloudflare Pages)

The React/Vite frontend includes [`frontend/public/_redirects`](file:///Users/harish/Downloads/ApplyFlow/frontend/public/_redirects) for SPA routing.

### 4.1 Deploy via Git Integration (Recommended)
1. In the Cloudflare Dashboard, navigate to **Compute (Workers) > Pages**.
2. Click **Create application** > **Pages** > **Connect to Git**.
3. Select your repository.
4. Set Build Settings:
   * **Framework preset:** `Vite`
   * **Root directory:** `frontend`
   * **Build command:** `npm run build`
   * **Build output directory:** `dist`
5. Configure Environment Variables:
   * Click **Environment variables (advanced)**.
   * Add:
     * **Variable:** `VITE_API_BASE_URL`
     * **Value:** `https://api.yourdomain.com` (or your Render URL: `https://applyflow-api.onrender.com`)
6. Click **Save and Deploy**.

### 4.2 Verify SPA Client-Side Routing
Once deployed:
1. Visit `https://<your-project>.pages.dev`.
2. Log in and navigate to `/resumes`, `/applications`, or `/dashboard`.
3. Press **Refresh (F5)** on any deep route.
4. Verify the page reloads cleanly without 404 errors (handled by `_redirects`).

---

## Step 5: Cloudflare DNS, SSL & Custom Domains

To run both frontend and backend under your own brand (e.g., `app.yourdomain.com` and `api.yourdomain.com`):

### 5.1 Add DNS Records
In Cloudflare Dashboard > **DNS** > **Records**:
* **Frontend:**
  * Type: `CNAME`
  * Name: `app` (or `@` for apex)
  * Target: `<your-project>.pages.dev`
  * Proxy status: **Proxied (Orange Cloud)**
* **Backend:**
  * Type: `CNAME`
  * Name: `api`
  * Target: `<your-service>.onrender.com` (or Railway domain)
  * Proxy status: **Proxied (Orange Cloud)**

### 5.2 Configure SSL/TLS
1. In Cloudflare Dashboard, go to **SSL/TLS** > **Overview**.
2. Select **Full (strict)** encryption mode.
3. Under **Edge Certificates**, enable **Always Use HTTPS** and **Minimum TLS Version: 1.2**.

---

## Step 6: Automated Resume Retention Cleanup

ApplyFlow includes an automated retention cleanup service that deletes expired resumes from Cloudflare R2 and updates metadata.

### 6.1 Configurable Retention Window
* Controlled by environment variable: `RESUME_RETENTION_DAYS` (default: `120`).
* Resumes older than the retention window or past their `expires_at` timestamp are automatically flagged.

### 6.2 Triggering Cleanup
* **Admin Endpoint:**
  Send a `POST` request to `/api/resumes/cleanup` with Super Admin JWT token:
  ```bash
  curl -X POST "https://api.yourdomain.com/api/resumes/cleanup?retention_days=120" \
       -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
  ```
* **Scheduled Cron Job:**
  Set up a daily cron trigger on Render (Render Cron Job) or using a Cloudflare Worker / cron-job.org calling `/api/resumes/cleanup` once every 24 hours.
