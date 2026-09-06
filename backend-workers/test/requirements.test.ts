import { describe, expect, it } from "vitest";
import app from "../src/index";
import {
  RequirementCreateSchema,
  RequirementUpdateSchema,
} from "../src/schemas/requirements";
import type { Bindings } from "../src/types";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/exec",
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
};

describe("Requirements (Job Openings) Module Tests", () => {
  describe("Zod Validation Schemas", () => {
    it("validates valid RequirementCreate payload", () => {
      const valid = {
        company: "Google",
        job_title: "Staff Cloud Engineer",
        role: "Cloud Engineer",
        priority: "High" as const,
        status: "active" as const,
        assignment_type: "all" as const,
      };
      const res = RequirementCreateSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it("fails when company is missing or empty", () => {
      const invalidEmpty = {
        company: "",
        job_title: "Engineer",
      };
      const resEmpty = RequirementCreateSchema.safeParse(invalidEmpty);
      expect(resEmpty.success).toBe(false);
      if (!resEmpty.success) {
        expect(resEmpty.error.issues[0]?.message).toBe("Company is required");
      }

      const invalidMissing = {
        job_title: "Engineer",
      };
      const resMissing = RequirementCreateSchema.safeParse(invalidMissing);
      expect(resMissing.success).toBe(false);
    });

    it("validates partial RequirementUpdate payload", () => {
      const update = {
        priority: "Low" as const,
        notes: "Position put on temporary freeze",
      };
      const res = RequirementUpdateSchema.safeParse(update);
      expect(res.success).toBe(true);
    });
  });

  describe("Endpoints Security & Unauthenticated Responses", () => {
    it("GET /api/requirements returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/requirements"), mockEnv);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.detail).toBe("Not authenticated");
    });

    it("POST /api/requirements returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/requirements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company: "Google" }),
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });
  });
});
