# Production Deployment Checklist — ApplyFlow Cloudflare Hybrid

Use this checklist to verify pre-flight requirements, deployment steps, and post-deployment validation.

---

## 1. Pre-Flight Preparation

- [x] **Frontend Builds Successfully**: `npm run build` exits code 0 in `frontend/`.
- [x] **SPA Routing**: `frontend/public/_redirects` exists and is copied to `frontend/dist/_redirects`.
- [x] **API Base URL Config**: `VITE_API_BASE_URL` logic supports custom domains and `/api` relative fallback.
- [x] **R2 Storage Service**: `backend/app/services/r2_storage.py` implements upload, presigned download/preview URLs, delete, and retention cleanup.
- [x] **Database Migration File**: `migrations/0001_add_r2_metadata.sql` ready with `r2_key`, `file_size`, `content_type`, `expires_at` columns.
- [x] **SQLAlchemy Models**: `backend/app/modules/resumes/models.py` updated with R2 fields.
- [x] **Backend Dependencies**: `boto3>=1.34.0` added to `backend/requirements.txt` and installed.
- [x] **Unit Tests Passing**: `tests/test_r2_storage.py` (5/5 tests passing).
- [x] **Existing Route Tests Passing**: `tests/test_all_endpoints.py`, `tests/test_delete_operations.py`, `tests/test_ai_gateway.py`.
- [x] **All AI/ML Pipelines Intact**: `scikit-learn`, `joblib`, `pandas`, `numpy`, `Groq`, and `OpenAI` untouched.
- [x] **ReportLab & Web Push Intact**: `reportlab` PDF generator and `pywebpush` untouched.

---

## 2. Cloudflare Infrastructure Provisioning

- [ ] **Cloudflare Account**: Active Cloudflare account with your domain configured.
- [ ] **R2 Bucket Created**: Bucket `applyflow-resumes` created in Cloudflare Dashboard.
- [ ] **R2 API Token Created**: Token generated with **Object Read & Write** permissions for `applyflow-resumes`.
- [ ] **R2 CORS Configured**: CORS policy added to bucket allowing `GET`, `PUT`, `HEAD` from `https://*.pages.dev` and your domains.
- [ ] **Cloudflare Pages Project Created**: Connected to Git repository, preset `Vite`, root `frontend`, build command `npm run build`, output dir `dist`.
- [ ] **Pages Environment Variables**: `VITE_API_BASE_URL` set in Cloudflare Pages settings.

---

## 3. Database & Backend Configuration

- [ ] **Neon PostgreSQL Instance Running**: Connection string verified with `sslmode=require`.
- [ ] **Database Migration Executed**: `migrations/0001_add_r2_metadata.sql` executed against Neon database.
- [ ] **Backend Environment Variables Set**:
  - `DATABASE_URL` set to Neon connection string.
  - `JWT_SECRET_KEY` generated with strong random secret.
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` configured.
  - `R2_BUCKET_NAME=applyflow-resumes`.
  - `RESUME_RETENTION_DAYS=120`.
  - `FRONTEND_URL` and `APP_CORS_ORIGINS` updated with Cloudflare Pages domain.
- [ ] **Backend Service Deployed**: Render / Railway service running with health check 200 at `/health`.

---

## 4. Post-Deployment Verification (Smoke Tests)

- [ ] **1. Authentication**:
  - Log in with Super Admin account (`/api/auth/login`).
  - Refresh token check (`/api/auth/refresh`).
- [ ] **2. Frontend Deep Links (Cloudflare Pages)**:
  - Open `https://your-pages-app.pages.dev/resumes` directly in a new tab.
  - Press browser refresh (`Cmd+R` / `F5`) — confirm no 404 error is shown.
- [ ] **3. Resume Upload to Cloudflare R2**:
  - Log in as Recruiter/Employee.
  - Upload a candidate resume (`.pdf`).
  - Confirm file is stored with key matching `resumes/{client_slug}/{year}/{month}/{uuid}_{filename}`.
  - Verify `r2_key` and metadata are populated in database.
- [ ] **4. Resume Preview via Presigned URL**:
  - Click Preview on uploaded resume.
  - Confirm browser redirects to Cloudflare R2 presigned preview URL and renders PDF inline.
- [ ] **5. Resume Download via Presigned URL**:
  - Click Download on resume.
  - Confirm file downloads with attachment filename header.
- [ ] **6. Automated Retention Cleanup Endpoint**:
  - As Admin, trigger `POST /api/resumes/cleanup`.
  - Verify JSON response returns `{ "success": true, ... }`.
- [ ] **7. Resume Deletion**:
  - Delete a test resume.
  - Confirm resume object is removed from R2 bucket and database.
- [ ] **8. AI Gateway**:
  - Verify Groq AI response extraction and email categorization function properly.
- [ ] **9. Dashboard Metrics**:
  - Verify KPI cards, candidate counts, and charts load without errors.
