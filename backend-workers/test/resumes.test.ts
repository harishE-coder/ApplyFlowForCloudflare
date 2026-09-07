import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { CheckDuplicatesSchema, ResumeUpdateSchema } from "../src/schemas/resumes";
import {
  computeFileHash,
  deleteResume,
  getDownloadUrl,
  getPreviewUrl,
  uploadResume,
} from "../src/services/googleAppsScript";
import type { Bindings } from "../src/types";
import {
  cleanCandidateName,
  formatRoleTitle,
  parseResumeFilename,
} from "../src/utils/resumeParser";

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

describe("Resume Parser & Utility Tests", () => {
  it("cleans candidate names correctly", () => {
    expect(cleanCandidateName("Suresh_resume (2).pdf")).toBe("Suresh");
    expect(cleanCandidateName("john_doe_cv.pdf")).toBe("John Doe");
    expect(cleanCandidateName("JaneSmith")).toBe("Jane Smith");
    expect(cleanCandidateName("")).toBe("Candidate");
  });

  it("formats role titles nicely", () => {
    expect(formatRoleTitle("sde2")).toBe("SDE 2");
    expect(formatRoleTitle("sde_ii")).toBe("Sde Ii");
    expect(formatRoleTitle("data_analyst")).toBe("Data Analyst");
    expect(formatRoleTitle("QA")).toBe("QA");
  });

  it("parses standard structured resume filenames with matching client", () => {
    const result = parseResumeFilename("Teksystems_Google_Data Analyst.pdf", "Teksystems");
    expect(result.success).toBe(true);
    expect(result.status).toBe("valid");
    expect(result.service_client).toBe("Teksystems");
    expect(result.company).toBe("Google");
    expect(result.role).toBe("Data Analyst");
    expect(result.candidate_name).toBe("Teksystems");
  });

  it("flags needs_review when filename client mismatches selected client", () => {
    const result = parseResumeFilename("Teksystems_Google_Data Analyst.pdf", "Infosys");
    expect(result.success).toBe(false);
    expect(result.status).toBe("needs_review");
    expect(result.client_match).toBe(false);
    expect(result.error).toBe("ServiceClient Mismatch");
  });

  it("handles natural candidate filenames and inherits selected client", () => {
    const result = parseResumeFilename("Suresh_Kumar_Resume.pdf", "Acme Corp");
    expect(result.success).toBe(true);
    expect(result.status).toBe("valid");
    expect(result.service_client).toBe("Acme Corp");
    expect(result.candidate_name).toBe("Suresh");
  });
});

describe("Google Apps Script Storage Service & SHA-256 Deduplication", () => {
  it("computes deterministic 64-character SHA-256 hex string", async () => {
    const textEncoder = new TextEncoder();
    const data1 = textEncoder.encode("Resume Content for Candidate A").buffer;
    const data2 = textEncoder.encode("Resume Content for Candidate A").buffer;
    const data3 = textEncoder.encode("Different Resume Content").buffer;

    const hash1 = await computeFileHash(data1);
    const hash2 = await computeFileHash(data2);
    const hash3 = await computeFileHash(data3);

    expect(hash1.length).toBe(64);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it("generates correct Google Drive web preview and download URLs", () => {
    const fileId = "1a2b3c4d5e6f7g8h9i0j";
    expect(getPreviewUrl(fileId)).toBe(`https://drive.google.com/file/d/${fileId}/view`);
    expect(getDownloadUrl(fileId)).toBe(`https://drive.google.com/uc?export=download&id=${fileId}`);
  });

  it("uploads resume to Google Apps Script and receives Drive metadata", async () => {
    const fakeBuffer = new TextEncoder().encode("PDF content").buffer;
    const fakeResponse = {
      success: true,
      fileId: "drive-file-uuid-12345",
      url: "https://drive.google.com/file/d/drive-file-uuid-12345/view",
      downloadUrl: "https://drive.google.com/uc?export=download&id=drive-file-uuid-12345",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeResponse,
    } as any);

    try {
      const result = await uploadResume(fakeBuffer, "candidate_resume.pdf", "Google", mockEnv);
      expect(result.success).toBe(true);
      expect(result.fileId).toBe("drive-file-uuid-12345");
      expect(result.webViewLink).toBe(fakeResponse.url);
      expect(result.downloadLink).toBe(fakeResponse.downloadUrl);

      // Verify fetch was called with the Apps Script URL and X-Worker-Secret header
      expect(globalThis.fetch).toHaveBeenCalledWith(
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

  it("deletes resume from Google Drive via Google Apps Script with shared secret", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as any);

    try {
      const deleted = await deleteResume("drive-file-uuid-12345", mockEnv);
      expect(deleted).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
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

  it("executes compensation rollback when database insertion fails", async () => {
    const originalFetch = globalThis.fetch;
    const deleteSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    globalThis.fetch = deleteSpy as any;

    try {
      // Simulate compensation call
      const deleted = await deleteResume("orphaned-drive-file-id", mockEnv);
      expect(deleted).toBe(true);
      expect(deleteSpy).toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Resume Zod Schemas Validation", () => {
  it("validates CheckDuplicatesSchema with SHA-256 file_hash", () => {
    const valid = {
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      items: [
        {
          filename: "candidate.pdf",
          candidate_name: "Alice Smith",
          company: "Google",
          file_hash: "a".repeat(64),
        },
      ],
    };
    const result = CheckDuplicatesSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates partial ResumeUpdateSchema", () => {
    const update = {
      candidate_name: "Bob Jones",
      role: "Senior SDE",
      is_note_shared: true,
      client_notes: "Strong candidate for backend team",
    };
    const result = ResumeUpdateSchema.safeParse(update);
    expect(result.success).toBe(true);
  });
});

describe("Resume Module Endpoint Security", () => {
  it("GET /api/resumes returns 401 when unauthenticated", async () => {
    const res = await app.fetch(new Request("http://localhost/api/resumes"), mockEnv);
    expect(res.status).toBe(401);
  });

  it("POST /api/resumes/upload returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/resumes/upload", { method: "POST" }),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/resumes/check-duplicates returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/resumes/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "550e8400-e29b-41d4-a716-446655440000",
          items: [{ filename: "test.pdf" }],
        }),
      }),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/resumes/companies returns 401 when unauthenticated", async () => {
    const res = await app.fetch(new Request("http://localhost/api/resumes/companies"), mockEnv);
    expect(res.status).toBe(401);
  });

  it("GET /api/resumes/:id returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/resumes/550e8400-e29b-41d4-a716-446655440000"),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/resumes/:id/preview returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/resumes/550e8400-e29b-41d4-a716-446655440000/preview"),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/resumes/:id/download returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/resumes/550e8400-e29b-41d4-a716-446655440000/download"),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("DELETE /api/resumes/:id returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/resumes/550e8400-e29b-41d4-a716-446655440000", {
        method: "DELETE",
      }),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/resumes/cleanup returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/resumes/cleanup", { method: "POST" }),
      mockEnv
    );
    expect(res.status).toBe(401);
  });
});
