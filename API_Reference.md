# ApplyFlow — Complete API Reference & Protocol Specification

> **Specification Version**: 1.2.0  
> **Base URL**: `/api` (e.g., `http://localhost:8000/api` or `https://api.applyflow.com/api`)  
> **Authentication**: Dual HTTP-Only JWT Cookies (`access_token`, `refresh_token`) or `Authorization: Bearer <token>` fallback  
> **Content-Type**: `application/json` (unless `multipart/form-data` for file uploads or binary for PDF streams)

---

## 1. Authentication & Session Bootstrap (`/api/auth`)

### 1.1 `POST /api/auth/login`
- **Description**: Authenticate user via corporate email and password. Sets HTTP-only `access_token` and `refresh_token` cookies, seeds memory cache, and triggers background dashboard pre-warming.
- **Auth**: Public (No auth required).
- **Request Body**:
  ```json
  {
    "email": "recruiter@applyflow.com",
    "password": "SecurePassword123"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "user": {
      "id": "c1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6071",
      "name": "Harish Recruiter",
      "email": "recruiter@applyflow.com",
      "role": "employee",
      "client_id": null,
      "is_active": true,
      "phone": "+1 (555) 234-5678",
      "status": "active"
    }
  }
  ```
- **Cookies Set**:
  - `access_token`: `HttpOnly; Path=/; Max-Age=3600; SameSite=Lax`
  - `refresh_token`: `HttpOnly; Path=/api/auth; Max-Age=604800; SameSite=Lax`
- **Errors**: `401 Unauthorized` (Invalid email or password / Account inactive).

---

### 1.2 `POST /api/auth/refresh`
- **Description**: Rotates access token using the HTTP-only `refresh_token` cookie.
- **Auth**: Public (Requires valid `refresh_token` cookie).
- **Response (`200 OK`)**:
  ```json
  {
    "message": "Token refreshed successfully"
  }
  ```
- **Errors**: `401 Unauthorized` (Missing, invalid, or expired refresh token).

---

### 1.3 `POST /api/auth/logout`
- **Description**: Invalidates the current session by deleting both authentication cookies.
- **Auth**: Authenticated.
- **Response (`200 OK`)**:
  ```json
  {
    "message": "Logged out"
  }
  ```

---

### 1.4 `GET /api/auth/me`
- **Description**: Returns the profile of the currently authenticated user.
- **Auth**: Authenticated (All roles).
- **Response (`200 OK`)**:
  ```json
  {
    "id": "c1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6071",
    "name": "Harish Recruiter",
    "email": "recruiter@applyflow.com",
    "role": "employee",
    "client_id": null,
    "is_active": true,
    "phone": "+1 (555) 234-5678",
    "status": "active"
  }
  ```

---

### 1.5 `GET /api/auth/bootstrap`
- **Description**: Unified application bootstrap endpoint returning user profile, role-specific dashboard telemetry, in-app notifications, and total unread chat count in a single roundtrip.
- **Auth**: Authenticated (All roles).
- **Response (`200 OK`)**:
  ```json
  {
    "user": {
      "id": "c1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6071",
      "name": "Harish Recruiter",
      "email": "recruiter@applyflow.com",
      "role": "employee",
      "client_id": null,
      "is_active": true,
      "status": "active"
    },
    "dashboard": {
      "today_uploads": 18,
      "total_resumes": 142,
      "today_applications": 14,
      "daily_target": 25,
      "completion_percentage": 56.0,
      "remaining_target": 11,
      "shift_active": true,
      "shift_duration": "03:45:12"
    },
    "notifications": {
      "items": [],
      "unread_count": 3
    },
    "chat_unread": {
      "total_unread": 2
    }
  }
  ```

---

## 2. Dashboard & Telemetry (`/api/dashboard`)

### 2.1 `GET /api/dashboard/home`
- **Description**: Universal single entry point for dashboard data, adaptive by authenticated role.
- **Query Params**:
  - `client_id` (UUID, optional): Filter by Service Client.
  - `employee_id` (UUID, optional): Filter by Recruiter.
  - `date_range` (string, optional): `today`, `yesterday`, `this_week`, `this_month`.
  - `custom_date` (string, optional): `YYYY-MM-DD`.
- **Response (`200 OK`)**: Returns role-tailored dashboard payload.

---

### 2.2 `GET /api/dashboard/admin/home`
- **Description**: Consolidated Super Admin and Sub-Admin dashboard home.
- **Auth**: `admin`, `sub_admin`.
- **Response (`200 OK`)**:
  ```json
  {
    "metrics": {
      "total_clients": 12,
      "total_resumes": 840,
      "today_uploads": 64,
      "total_applications": 520,
      "today_applications": 48,
      "total_daily_target": 180,
      "overall_completion_pct": 26.7,
      "active_recruiters": 8,
      "sub_admins_count": 2
    },
    "clients": [
      {
        "id": "e2b3c4d5-e6f7-809a-1b2c-3d4e5f607182",
        "company_name": "ABC Staffing",
        "total_resumes": 310,
        "total_applications": 220,
        "active_requirements": 5,
        "assigned_recruiters_count": 3
      }
    ],
    "leaderboard": [
      {
        "employee_id": "c1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6071",
        "name": "Harish Recruiter",
        "daily_target": 25,
        "today_submitted": 14,
        "remaining": 11,
        "completion_percentage": 56.0
      }
    ],
    "charts": {
      "target_vs_actual": [],
      "velocity_trend": [],
      "client_breakdown": [],
      "stage_distribution": []
    }
  }
  ```

---

### 2.3 `GET /api/dashboard/employee/home`
- **Description**: Consolidated Recruiter / Employee dashboard home.
- **Auth**: `employee`.
- **Response (`200 OK`)**:
  ```json
  {
    "metrics": {
      "today_uploads": 18,
      "total_resumes": 142,
      "today_applications": 14,
      "daily_target": 25,
      "completion_percentage": 56.0,
      "remaining_target": 11,
      "active_requirements": 4
    },
    "attendance": {
      "is_active": true,
      "check_in": "2026-08-28T09:00:00Z",
      "check_out": null,
      "total_hours": null
    },
    "assigned_clients": [
      {
        "client_id": "e2b3c4d5-e6f7-809a-1b2c-3d4e5f607182",
        "client_name": "ABC Staffing",
        "daily_target": 15,
        "achieved_today": 9,
        "completion_percentage": 60.0
      }
    ],
    "recent_activity": []
  }
  ```

---

### 2.4 `GET /api/dashboard/client/home`
- **Description**: Consolidated Service Client Customer Portal home.
- **Auth**: `client`.
- **Response (`200 OK`)**:
  ```json
  {
    "client_name": "ABC Staffing",
    "total_candidates": 310,
    "total_applications": 220,
    "active_interviews": 18,
    "offers_extended": 6,
    "joined_count": 4,
    "pipeline_stages": {
      "Submitted": 120,
      "Shortlisted": 45,
      "Technical Round": 28,
      "HR Round": 15,
      "Offer": 6,
      "Rejected": 6
    },
    "recent_events": []
  }
  ```

---

## 3. Resume & Ingestion Engine (`/api/resumes`)

### 3.1 `POST /api/resumes/upload`
- **Description**: Bulk upload candidate resumes into selected Service Client.
- **Auth**: `employee` (Recruiters only).
- **Request (Multipart Form Data)**:
  - `files`: Array of PDF files (1 to 100+).
  - `client_id` (UUID, required): Target Service Client.
  - `resume_date` (date, optional): `YYYY-MM-DD`.
  - `requirement_id` (UUID, optional): Associated job opening.
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "total_files": 2,
    "saved_count": 2,
    "uploaded": 2,
    "needs_review_count": 0,
    "rejected_count": 0,
    "client_synced": true,
    "dashboard": {
      "today_uploads": 20,
      "total_resumes": 144
    },
    "items": [
      {
        "filename": "ABCStaffing_TCS_JavaLead_RahulKumar.pdf",
        "status": "saved",
        "message": "Successfully parsed and saved to database & storage.",
        "company": "TCS",
        "role": "Java Lead",
        "candidate_name": "Rahul Kumar",
        "resume_id_tag": "RES101",
        "client_name": "ABC Staffing",
        "client_id": "e2b3c4d5-e6f7-809a-1b2c-3d4e5f607182",
        "saved_resume_id": "f3a4b5c6-d7e8-901a-2b3c-4d5e6f708192"
      }
    ]
  }
  ```

---

### 3.2 `POST /api/resumes/check-duplicates`
- **Description**: Scans client candidate bank for duplicate profiles prior to committing batch.
- **Auth**: `admin`, `sub_admin`, `employee`.
- **Request Body**:
  ```json
  {
    "client_id": "e2b3c4d5-e6f7-809a-1b2c-3d4e5f607182",
    "items": [
      {
        "filename": "ABCStaffing_TCS_JavaLead_RahulKumar.pdf",
        "candidate_name": "Rahul Kumar",
        "company": "TCS",
        "resume_id_tag": "RES101"
      }
    ]
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "results": [
      {
        "filename": "ABCStaffing_TCS_JavaLead_RahulKumar.pdf",
        "is_duplicate": false,
        "duplicate_resume_id": null,
        "existing_candidate": null,
        "existing_company": null
      }
    ]
  }
  ```

---

### 3.3 `GET /api/resumes/{resume_id}/preview`
- **Description**: Verifies caller authentication and client scope, then returns HTTP 307 redirect to Google Drive web view link (`drive_web_view_link`).
- **Auth**: Authenticated (Scoped to resume's client).
- **Response (`307 Temporary Redirect`)**: Redirects to Google Drive web view link.

---

### 3.4 `GET /api/resumes/{resume_id}/download`
- **Description**: Verifies caller authentication and client scope, then returns HTTP 307 redirect to Google Drive direct download link (`drive_download_link`).
- **Auth**: Authenticated (Scoped to resume's client).
- **Response (`307 Temporary Redirect`)**: Redirects to Google Drive download link.

---

### 3.5 `DELETE /api/resumes/{resume_id}`
- **Description**: Deletes resume from database, local disk, and Google Drive. Also removes linked applications.
- **Auth**: `admin` (Any resume), `sub_admin` (Assigned clients), `employee` (Own uploads only).
- **Response (`200 OK`)**:
  ```json
  {
    "message": "Resume deleted successfully from database and Google Drive."
  }
  ```

---

## 4. Groq AI Email Intake & Applications (`/api/ai` & `/api/applications`)

### 4.1 `POST /api/ai/analyze-email`
- **Description**: Phase 1 preview-only extraction using Groq LLaMA 3.3 70B (`temperature=0.0`). Zero database writes.
- **Auth**: Authenticated (Recruiters, Admins).
- **Request Body**:
  ```json
  {
    "raw_email": "Hi Team, We have scheduled Round 1 Technical Interview for Rahul Kumar on 2026-08-28 at 10:00 AM for Java Lead at TCS.",
    "client_id": "e2b3c4d5-e6f7-809a-1b2c-3d4e5f607182",
    "source_type": "paste"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "is_interview_mail": true,
    "decision": "existing_application",
    "decision_text": "Existing application found for Rahul Kumar. Round advancing to Round 1 Technical.",
    "candidate_name": "Rahul Kumar",
    "company": "TCS",
    "role": "Java Lead",
    "status": "Shortlisted",
    "round": "Round 1 Technical",
    "interview_date": "2026-08-28",
    "client_id": "e2b3c4d5-e6f7-809a-1b2c-3d4e5f607182",
    "client_name": "ABC Staffing",
    "matched_application_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
    "matched_resume_id": "f3a4b5c6-d7e8-901a-2b3c-4d5e6f708192",
    "resume_matched": true,
    "match_priority": 2,
    "match_reason": "Matched by Candidate Name (Rahul Kumar) + Company (TCS)"
  }
  ```

---

### 4.2 `POST /api/ai/confirm-save`
- **Description**: Phase 2 execution. Persists confirmed candidate event, creates/updates application, writes `email_intake`, appends `application_events`, posts update to Client Chat Room, and dispatches scoped in-app notifications.
- **Auth**: Authenticated.
- **Request Body**:
  ```json
  {
    "candidate_name": "Rahul Kumar",
    "company": "TCS",
    "role": "Java Lead",
    "status": "Shortlisted",
    "round": "Round 1 Technical",
    "interview_date": "2026-08-28T10:00:00Z",
    "client_id": "e2b3c4d5-e6f7-809a-1b2c-3d4e5f607182",
    "raw_email": "Hi Team, We have scheduled...",
    "source_type": "paste",
    "resume_id": "f3a4b5c6-d7e8-901a-2b3c-4d5e6f708192",
    "matched_application_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "action_type": "follow_up",
    "extracted_data": {
      "candidate_name": "Rahul Kumar",
      "company": "TCS",
      "role": "Java Lead",
      "round": "Round 1 Technical"
    },
    "application": {
      "id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
      "candidate_name": "Rahul Kumar",
      "company": "TCS",
      "role": "Java Lead",
      "status": "Shortlisted",
      "current_round": "Round 1 Technical",
      "interview_date": "2026-08-28T10:00:00Z",
      "is_ai_processed": true
    },
    "message": "Successfully confirmed and saved Rahul Kumar at Round 1 Technical."
  }
  ```

---

### 4.3 `GET /api/applications/{app_id}/timeline`
- **Description**: Returns chronological audit trail of all interview events, rounds, notes, and raw email snippets for a candidate.
- **Auth**: Authenticated (Scoped).
- **Response (`200 OK`)**:
  ```json
  {
    "application_id": "a1b2c3d4-e5f6-7890-1234-56789abcdef0",
    "candidate_name": "Rahul Kumar",
    "company": "TCS",
    "role": "Java Lead",
    "current_status": "Shortlisted",
    "current_round": "Round 1 Technical",
    "client_name": "ABC Staffing",
    "events": [
      {
        "id": "b1c2d3e4-f5a6-7b8c-9d0e-1f2a3b4c5d6e",
        "event_type": "Submitted",
        "round_name": "Application Submitted",
        "event_date": "2026-08-26T10:14:00Z",
        "created_by_name": "Harish Recruiter"
      },
      {
        "id": "c2d3e4f5-a6b7-8c9d-0e1f-2a3b4c5d6e7f",
        "event_type": "Round 1 Technical",
        "round_name": "Round 1 Technical",
        "event_date": "2026-08-28T10:00:00Z",
        "created_by_name": "Harish Recruiter"
      }
    ]
  }
  ```

---

## 5. Real-Time Client Chat (`/api/chat`)

### 5.1 `GET /api/chat/rooms`
- **Description**: Returns list of all chat rooms accessible to the authenticated user.
- **Auth**: Authenticated.
- **Response (`200 OK`)**:
  ```json
  {
    "rooms": [
      {
        "room_id": "d1e2f3a4-b5c6-7d8e-9f0a-1b2c3d4e5f60",
        "client_id": "e2b3c4d5-e6f7-809a-1b2c-3d4e5f607182",
        "client_name": "ABC Staffing",
        "status": "active",
        "unread_count": 2,
        "last_message": {
          "id": "e1f2a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b",
          "message": "Shared resume for Rahul Kumar",
          "created_at": "2026-08-28T11:20:00Z"
        }
      }
    ]
  }
  ```

---

### 5.2 `POST /api/chat/rooms/{room_id}/messages`
- **Description**: Sends a message to a chat room and broadcasts it via WebSocket.
- **Auth**: Authenticated (Member of room).
- **Request Body**:
  ```json
  {
    "message": "Hi John, attached is the revised candidate profile for TCS.",
    "attachment_type": "resume",
    "attachment_reference": "f3a4b5c6-d7e8-901a-2b3c-4d5e6f708192"
  }
  ```
- **Response (`200 OK`)**: Chat message entity.

---

### 5.3 `WS /api/chat/rooms/{room_id}/ws` (also `/ws/chat/{room_id}`)
- **Description**: Real-time bidirectional WebSocket connection backed by Cloudflare Durable Objects (`ChatRoomDO`) for live messaging, room co-location, typing indicators, read receipts, and 30-second presence heartbeats.
- **Authentication**: Authenticated directly via HTTP-only JWT cookie (`access_token`). If missing or expired, Worker returns `401 Unauthorized` before upgrading.
- **Persistence Guarantee**: Neon PostgreSQL is the absolute source of truth. Every message is persisted to Neon before broadcasting from the Durable Object isolate.
- **Events & Protocol**:
  - `ping` / `pong`: Client sends `{ "type": "ping" }` every 30 seconds; Durable Object responds `{ "type": "pong", "timestamp": ... }` and resets presence timer. Disconnects after missed heartbeat (> 35s).
  - `new_message`: Dispatched to connected room sockets when a message is sent.
  - `typing`: Broadcasts `{ "type": "typing", "user_name": "Harish", "is_typing": true }`.
  - `read`: Dispatches read receipts `{ "type": "read_receipt", "user_name": "John", "message_id": "..." }`.
  - `presence`: Broadcasts `{ "type": "presence", "online_users": ["user-id-1", ...] }`.
  - `message_status`: Broadcasts delivery or read acknowledgments.

---

## 6. Targets & Quotas Engine (`/api/targets`)

### 6.1 `POST /api/targets`
- **Description**: Admin/Sub-Admin creates or updates a daily submission target.
- **Auth**: `admin`, `sub_admin`.
- **Request Body**:
  ```json
  {
    "employee_id": "c1a2b3c4-d5e6-7f80-9a1b-2c3d4e5f6071",
    "client_id": "e2b3c4d5-e6f7-809a-1b2c-3d4e5f607182",
    "daily_target": 25,
    "status": "active"
  }
  ```
- **Response (`200 OK`)**: Created target entity.

---

### 6.2 `GET /api/targets/progress`
- **Description**: Returns employee target progress breakdown and overall percentage.
- **Auth**: `employee` (own), `admin`/`sub_admin` (scoped query).
- **Response (`200 OK`)**:
  ```json
  {
    "total_target": 25,
    "total_achieved": 14,
    "overall_percentage": 56.0,
    "client_breakdown": [
      {
        "client_id": "e2b3c4d5-e6f7-809a-1b2c-3d4e5f607182",
        "client_name": "ABC Staffing",
        "daily_target": 25,
        "achieved_count": 14,
        "completion_percentage": 56.0
      }
    ]
  }
  ```

---

## 7. Shift Attendance (`/api/attendance`)

### 7.1 `POST /api/attendance/check-in`
- **Description**: Starts recruiter workday session.
- **Auth**: `employee`.
- **Response (`200 OK`)**: Attendance record with `check_in = NOW()` and `is_active = true`.

---

### 7.2 `POST /api/attendance/check-out`
- **Description**: Concludes recruiter workday session and calculates total hours.
- **Auth**: `employee`.
- **Response (`200 OK`)**: Attendance record with `check_out = NOW()` and `total_hours = "8h 15m"`.

---

## 8. Multi-Format Reports & Exports (`/api/reports`)

### 8.1 `GET /api/reports/excel`
- **Description**: Downloads multi-sheet Excel workbook (`.xlsx`) with client breakdowns, candidate logs, and recruiter quotas.
- **Auth**: `admin`, `sub_admin`.
- **Response (`200 OK`)**: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

---

### 8.2 `GET /api/reports/pdf`
- **Description**: Generates executive PDF recruitment summary report.
- **Auth**: `admin`, `sub_admin`.
- **Response (`200 OK`)**: `application/pdf`.

---

### 8.3 `GET /api/reports/export/clients`
- **Description**: Exports active or archived clients as CSV.
- **Auth**: `admin`, `sub_admin`.
- **Response (`200 OK`)**: `text/csv`.
