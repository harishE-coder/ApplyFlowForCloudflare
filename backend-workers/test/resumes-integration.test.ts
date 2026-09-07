import { describe, expect, it, vi, beforeEach } from "vitest";
import { createAccessToken } from "../src/auth";
import type { Bindings, UserPayload } from "../src/types";

// In-memory mock database state
const mockAdminUser = {
  id: "a0000000-0000-0000-0000-000000000001",
  name: "Admin User",
  email: "admin@applyflow.com",
  role: "super_admin",
  client_id: null,
  is_active: true,
};

const mockRecruiterUser = {
  id: "b0000000-0000-0000-0000-000000000002",
  name: "Recruiter Bob",
  email: "recruiter@applyflow.com",
  role: "recruiter",
  client_id: null,
  is_active: true,
};

const mockClient = {
  id: "c0000000-0000-0000-0000-000000000001",
  company_name: "Acme Corp",
  status: "active",
};

let mockResumes: any[] = [];
let shouldFailDbInsert = false;

vi.mock("../src/db", () => {
  return {
    getDb: () => {
      const mockQuery = async (strings: TemplateStringsArray | string, ...values: any[]) => {
        const queryText = typeof strings === "string" ? strings : strings.join("?");

        const normalized = queryText.replace(/\s+/g, " ");

        // Auth user lookup
        if (normalized.includes("FROM users WHERE id =") || (normalized.includes("users") && normalized.includes("WHERE id ="))) {
          const id = String(values[0]);
          if (id === mockAdminUser.id) return [mockAdminUser];
          if (id === mockRecruiterUser.id) return [mockRecruiterUser];
          return [];
        }

        // Employee clients lookup
        if (normalized.includes("FROM employee_clients")) {
          return [{ client_id: mockClient.id }];
        }

        // Active clients lookup
        if (normalized.includes("SELECT id FROM clients WHERE status = 'active'")) {
          return [{ id: mockClient.id }];
        }

        // Client lookup by id
        if (normalized.includes("FROM clients WHERE id =")) {
          const clientId = String(values[0]);
          if (clientId === mockClient.id) return [mockClient];
          return [];
        }

        // Duplicate check query
        if (normalized.includes("FROM resumes") && (normalized.includes("file_hash =") || normalized.includes("LOWER(candidate_name)"))) {
          const clientId = String(values[0]);
          const fileHash = String(values[1]);
          const candidateName = String(values[2] || "").toLowerCase();
          const company = String(values[3] || "").toLowerCase();

          const found = mockResumes.filter((r) => {
            if (r.client_id !== clientId) return false;
            if (r.file_hash && r.file_hash === fileHash) return true;
            if (r.candidate_name.toLowerCase() === candidateName && r.company.toLowerCase() === company) return true;
            return false;
          });
          return found;
        }

        // Resume lookup by id (for preview, download, delete, get)
        if (normalized.includes("SELECT") && normalized.includes("FROM resumes") && normalized.includes("WHERE id =")) {
          const resumeId = String(values[0]);
          const found = mockResumes.filter((r) => String(r.id) === resumeId);
          return found;
        }

        // Insert resume
        if (normalized.includes("INSERT INTO resumes")) {
          if (shouldFailDbInsert) {
            throw new Error("Simulated Neon DB insertion error for compensation rollback test");
          }
          const resumeId = values[0];
          const newRecord = {
            id: resumeId,
            candidate_name: values[1],
            company: values[2],
            role: values[3],
            resume_id_tag: values[4],
            requirement_id: values[5],
            client_id: values[6],
            uploaded_by: values[7],
            drive_file_id: values[8],
            drive_web_view_link: values[9],
            drive_download_link: values[10],
            file_hash: values[11],
            file_size: values[12],
            content_type: values[13],
            original_filename: values[14],
            resume_date: values[15],
            upload_date: new Date().toISOString(),
          };
          mockResumes.push(newRecord);
          return [newRecord];
        }

        // Batch delete expired resumes
        if (normalized.includes("DELETE FROM resumes") && normalized.includes("ANY")) {
          const ids = Array.isArray(values[0]) ? values[0].map(String) : [String(values[0])];
          mockResumes = mockResumes.filter((r) => !ids.includes(String(r.id)));
          return [];
        }

        // Delete resume by id
        if (normalized.includes("DELETE FROM resumes WHERE id =")) {
          const resumeId = String(values[0]);
          mockResumes = mockResumes.filter((r) => String(r.id) !== resumeId);
          return [];
        }

        // Cleanup expired resumes query
        if (normalized.includes("upload_date < NOW")) {
          return [...mockResumes];
        }

        // Generic delete
        if (normalized.includes("DELETE FROM resumes")) {
          mockResumes = [];
          return [];
        }

        return [];
      };
      return mockQuery;
    },
  };
});

import app from "../src/index";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/test-app-script-id/exec",
  GOOGLE_APPS_SCRIPT_SECRET: "test-worker-shared-secret",
  RESUME_RETENTION_DAYS: "120",
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
};

describe("Resume Endpoints Integration with Google Apps Script Storage", () => {
  beforeEach(() => {
    mockResumes = [];
    shouldFailDbInsert = false;
    vi.restoreAllMocks();
  });

  it("POST /api/resumes/upload successfully uploads to Apps Script and saves metadata in DB", async () => {
    const recruiterToken = await createAccessToken(
      mockRecruiterUser as UserPayload,
      mockEnv.JWT_SECRET_KEY
    );

    // Mock fetch for Google Apps Script upload
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("script.google.com")) {
        return new Response(
          JSON.stringify({
            success: true,
            fileId: "drive-file-abc-123",
            url: "https://drive.google.com/file/d/drive-file-abc-123/view",
            downloadUrl: "https://drive.google.com/uc?export=download&id=drive-file-abc-123",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(url, init);
    });
    globalThis.fetch = fetchSpy;

    try {
      const formData = new FormData();
      const fakePdf = new Blob(["%PDF-1.4 Fake Resume Content"], { type: "application/pdf" });
      formData.append("files", fakePdf, "Acme Corp_Google_Senior Dev.pdf");
      formData.append("client_id", mockClient.id);

      const res = await app.fetch(
        new Request("http://localhost/api/resumes/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${recruiterToken}`,
          },
          body: formData,
        }),
        mockEnv
      );

      expect([200, 201]).toContain(res.status);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.saved_count).toBe(1);
      expect(json.rejected_count).toBe(0);
      expect(json.items[0].status).toBe("saved");
      expect(json.items[0].drive_file_id).toBe("drive-file-abc-123");
      expect(json.items[0].drive_web_view_link).toBe("https://drive.google.com/file/d/drive-file-abc-123/view");
      expect(json.items[0].drive_download_link).toBe("https://drive.google.com/uc?export=download&id=drive-file-abc-123");

      // Verify Apps Script was invoked with secret header
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(mockEnv.GOOGLE_APPS_SCRIPT_URL),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Worker-Secret": "test-worker-shared-secret",
          }),
        })
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /api/resumes/upload detects duplicate file_hash and rejects duplicate upload", async () => {
    const recruiterToken = await createAccessToken(
      mockRecruiterUser as UserPayload,
      mockEnv.JWT_SECRET_KEY
    );

    // Populate mock DB with existing resume with a specific hash
    const fakeContent = "%PDF-1.4 Identical Content";
    // We compute the hash using WebCrypto
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fakeContent));
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    mockResumes.push({
      id: "existing-resume-uuid",
      client_id: mockClient.id,
      candidate_name: "Acme Corp",
      company: "Google",
      role: "Senior Dev",
      file_hash: hex,
      drive_file_id: "drive-existing-file",
      drive_web_view_link: "https://drive.google.com/file/d/drive-existing-file/view",
      drive_download_link: "https://drive.google.com/uc?export=download&id=drive-existing-file",
    });

    const formData = new FormData();
    const fakePdf = new Blob([fakeContent], { type: "application/pdf" });
    formData.append("files", fakePdf, "Acme Corp_Google_Senior Dev.pdf");
    formData.append("client_id", mockClient.id);

    const res = await app.fetch(
      new Request("http://localhost/api/resumes/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${recruiterToken}`,
        },
        body: formData,
      }),
      mockEnv
    );

    expect([200, 201]).toContain(res.status);
    const json = await res.json();
    expect(json.saved_count).toBe(0);
    expect(json.rejected_count).toBe(1);
    expect(json.items[0].status).toBe("duplicate");
    expect(json.items[0].is_duplicate).toBe(true);
  });

  it("POST /api/resumes/upload performs compensation rollback if DB insert fails", async () => {
    const recruiterToken = await createAccessToken(
      mockRecruiterUser as UserPayload,
      mockEnv.JWT_SECRET_KEY
    );

    shouldFailDbInsert = true;

    const originalFetch = globalThis.fetch;
    const deleteCalls: any[] = [];
    const fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("script.google.com")) {
        const bodyStr = String(init?.body || "");
        const params = init?.body instanceof FormData ? init.body : new URLSearchParams(bodyStr);
        const action = params.get("action") || (url.includes("action=") ? new URL(url).searchParams.get("action") : null);
        if (action === "delete") {
          deleteCalls.push({ action, fileId: params.get("fileId") });
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({
            success: true,
            fileId: "drive-orphan-file-999",
            url: "https://drive.google.com/file/d/drive-orphan-file-999/view",
            downloadUrl: "https://drive.google.com/uc?export=download&id=drive-orphan-file-999",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return originalFetch(url, init);
    });
    globalThis.fetch = fetchSpy;

    try {
      const formData = new FormData();
      const fakePdf = new Blob(["%PDF-1.4 Unique Compensation Test"], { type: "application/pdf" });
      formData.append("files", fakePdf, "Acme Corp_Google_Architect.pdf");
      formData.append("client_id", mockClient.id);

      const res = await app.fetch(
        new Request("http://localhost/api/resumes/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${recruiterToken}`,
          },
          body: formData,
        }),
        mockEnv
      );

      expect([200, 500]).toContain(res.status);
      const json = await res.json();
      if (res.status === 500) {
        expect(json.detail).toContain("Database insertion failed");
      } else {
        expect(json.saved_count).toBe(0);
        expect(json.rejected_count).toBe(1);
        expect(json.items[0].status).toBe("rejected");
        expect(json.items[0].message).toContain("Database failure");
      }

      // Verify compensation rollback: deleteResume was immediately triggered for orphaned file
      expect(deleteCalls.length).toBe(1);
      expect(deleteCalls[0].fileId).toBe("drive-orphan-file-999");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("GET /api/resumes/:id/preview returns HTTP 307 redirect to drive_web_view_link", async () => {
    const adminToken = await createAccessToken(
      mockAdminUser as UserPayload,
      mockEnv.JWT_SECRET_KEY
    );

    mockResumes.push({
      id: "preview-test-resume-id",
      client_id: mockClient.id,
      candidate_name: "Alice Smith",
      drive_file_id: "drive-file-preview-123",
      drive_web_view_link: "https://drive.google.com/file/d/drive-file-preview-123/view",
      drive_download_link: "https://drive.google.com/uc?export=download&id=drive-file-preview-123",
      original_filename: "Alice_Resume.pdf",
    });

    const res = await app.fetch(
      new Request("http://localhost/api/resumes/preview-test-resume-id/preview", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }),
      mockEnv
    );

    // Verify HTTP 302/307 redirect to Google Drive web view link
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("Location")).toBe("https://drive.google.com/file/d/drive-file-preview-123/view");
  });

  it("GET /api/resumes/:id/download returns HTTP 307 redirect to drive_download_link", async () => {
    const adminToken = await createAccessToken(
      mockAdminUser as UserPayload,
      mockEnv.JWT_SECRET_KEY
    );

    mockResumes.push({
      id: "download-test-resume-id",
      client_id: mockClient.id,
      candidate_name: "Bob Jones",
      drive_file_id: "drive-file-dl-456",
      drive_web_view_link: "https://drive.google.com/file/d/drive-file-dl-456/view",
      drive_download_link: "https://drive.google.com/uc?export=download&id=drive-file-dl-456",
      original_filename: "Bob_Resume.pdf",
    });

    const res = await app.fetch(
      new Request("http://localhost/api/resumes/download-test-resume-id/download", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      }),
      mockEnv
    );

    // Verify HTTP 302/307 redirect to Google Drive direct download link
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("Location")).toBe("https://drive.google.com/uc?export=download&id=drive-file-dl-456");
  });

  it("DELETE /api/resumes/:id calls deleteResume on Google Drive and deletes record from DB", async () => {
    const adminToken = await createAccessToken(
      mockAdminUser as UserPayload,
      mockEnv.JWT_SECRET_KEY
    );

    mockResumes.push({
      id: "delete-test-resume-id",
      client_id: mockClient.id,
      drive_file_id: "drive-delete-file-789",
    });

    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("script.google.com")) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url, init);
    });
    globalThis.fetch = fetchSpy;

    try {
      const res = await app.fetch(
        new Request("http://localhost/api/resumes/delete-test-resume-id", {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }),
        mockEnv
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify Google Apps Script was called with action: delete and X-Worker-Secret
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(mockEnv.GOOGLE_APPS_SCRIPT_URL),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Worker-Secret": "test-worker-shared-secret",
          }),
        })
      );

      // Verify DB record removed
      expect(mockResumes.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("POST /api/resumes/cleanup purges expired resumes via Apps Script and DB", async () => {
    const adminToken = await createAccessToken(
      mockAdminUser as UserPayload,
      mockEnv.JWT_SECRET_KEY
    );

    mockResumes.push(
      { id: "expired-1", drive_file_id: "drive-exp-1" },
      { id: "expired-2", drive_file_id: "drive-exp-2" }
    );

    const originalFetch = globalThis.fetch;
    const deletedFileIds: string[] = [];
    const fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("script.google.com")) {
        const bodyStr = String(init?.body || "");
        const params = init?.body instanceof FormData ? init.body : new URLSearchParams(bodyStr);
        deletedFileIds.push(String(params.get("fileId")));
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url, init);
    });
    globalThis.fetch = fetchSpy;

    try {
      const res = await app.fetch(
        new Request("http://localhost/api/resumes/cleanup?retention_days=90", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }),
        mockEnv
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.cleaned_count).toBe(2);
      expect(deletedFileIds).toContain("drive-exp-1");
      expect(deletedFileIds).toContain("drive-exp-2");
      expect(mockResumes.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
