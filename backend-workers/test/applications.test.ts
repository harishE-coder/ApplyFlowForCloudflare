import { describe, expect, it } from "vitest";
import app from "../src/index";
import {
  ApplicationCreateSchema,
  ApplicationNotesUpdateSchema,
  ApplicationStatusUpdateSchema,
} from "../src/schemas/applications";
import type { Bindings } from "../src/types";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  RESUMES_BUCKET: {} as any,
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
};

describe("Applications Module Tests", () => {
  describe("Zod Validation Schemas", () => {
    it("validates valid ApplicationCreate payload", () => {
      const valid = {
        resume_id: "550e8400-e29b-41d4-a716-446655440000",
        requirement_id: "660e8400-e29b-41d4-a716-446655440000",
        status: "Submitted",
        current_round: "Initial Application",
      };
      const res = ApplicationCreateSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it("rejects ApplicationCreate when resume_id is not a valid UUID", () => {
      const invalid = {
        resume_id: "not-a-uuid",
      };
      const res = ApplicationCreateSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toBe("Invalid resume UUID");
      }
    });

    it("validates valid ApplicationStatusUpdate", () => {
      const valid = {
        status: "Interview",
        current_round: "Technical Round 1",
      };
      const res = ApplicationStatusUpdateSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it("rejects empty status in ApplicationStatusUpdate", () => {
      const invalid = {
        status: "",
      };
      const res = ApplicationStatusUpdateSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toBe("Status is required");
      }
    });

    it("validates ApplicationNotesUpdate", () => {
      const valid = {
        client_notes: "Strong candidate with 5 years React experience",
        is_note_shared: true,
      };
      const res = ApplicationNotesUpdateSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });
  });

  describe("Endpoints Security & Unauthenticated Responses", () => {
    it("GET /api/applications returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/applications"), mockEnv);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.detail).toBe("Not authenticated");
    });

    it("GET /api/applications/stats returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/applications/stats"), mockEnv);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.detail).toBe("Not authenticated");
    });

    it("POST /api/applications returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume_id: "550e8400-e29b-41d4-a716-446655440000" }),
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("PATCH /api/applications/:id/status returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/applications/550e8400-e29b-41d4-a716-446655440000/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Interview" }),
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });
  });
});
