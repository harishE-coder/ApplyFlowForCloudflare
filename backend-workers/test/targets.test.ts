import { describe, expect, it } from "vitest";
import app from "../src/index";
import {
  EmployeeTargetProgressResponseSchema,
  TargetResponseSchema,
  TargetSetRequestSchema,
} from "../src/schemas/targets";
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

describe("Targets Module Tests", () => {
  it("validates TargetSetRequestSchema", () => {
    const valid = {
      employee_id: "550e8400-e29b-41d4-a716-446655440000",
      client_id: "550e8400-e29b-41d4-a716-446655440001",
      daily_target: 15,
      status: "active" as const,
    };
    const result = TargetSetRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("fails TargetSetRequestSchema with negative or zero target", () => {
    const invalid = {
      employee_id: "550e8400-e29b-41d4-a716-446655440000",
      client_id: "550e8400-e29b-41d4-a716-446655440001",
      daily_target: 0,
    };
    const result = TargetSetRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("validates TargetResponseSchema", () => {
    const valid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      employee_id: "550e8400-e29b-41d4-a716-446655440001",
      employee_name: "Alice Recruiter",
      client_id: "550e8400-e29b-41d4-a716-446655440002",
      client_name: "Stripe",
      daily_target: 10,
      status: "active",
      effective_date: "2026-09-06",
    };
    const result = TargetResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates EmployeeTargetProgressResponseSchema", () => {
    const valid = {
      total_target: 20,
      total_achieved: 14,
      overall_percentage: 70.0,
      client_breakdown: [
        {
          client_id: "550e8400-e29b-41d4-a716-446655440002",
          client_name: "Stripe",
          daily_target: 20,
          achieved_count: 14,
          completion_percentage: 70.0,
        },
      ],
    };
    const result = EmployeeTargetProgressResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  describe("Endpoints Security & Unauthenticated Responses", () => {
    it("GET /api/targets returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/targets"), mockEnv);
      expect(res.status).toBe(401);
    });

    it("POST /api/targets returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/targets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employee_id: "550e8400-e29b-41d4-a716-446655440000",
            client_id: "550e8400-e29b-41d4-a716-446655440001",
            daily_target: 10,
          }),
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("GET /api/targets/progress returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/targets/progress"), mockEnv);
      expect(res.status).toBe(401);
    });

    it("DELETE /api/targets/:id returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/targets/550e8400-e29b-41d4-a716-446655440000", {
          method: "DELETE",
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });
  });
});
