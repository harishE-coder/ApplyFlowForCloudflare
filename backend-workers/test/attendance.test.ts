import { describe, expect, it } from "vitest";
import app from "../src/index";
import { AdminAttendanceSummarySchema, AttendanceRecordResponseSchema } from "../src/schemas/attendance";
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

describe("Attendance Module Tests", () => {
  it("validates AttendanceRecordResponseSchema", () => {
    const valid = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      employee_id: "550e8400-e29b-41d4-a716-446655440001",
      work_date: "2026-09-06",
      check_in: new Date().toISOString(),
      check_out: null,
      total_hours: null,
      is_active: true,
    };
    const result = AttendanceRecordResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates AdminAttendanceSummarySchema", () => {
    const valid = {
      present_today: 10,
      checked_in: 12,
      checked_out: 4,
      working_now: 8,
      active_employees: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          employee_id: "550e8400-e29b-41d4-a716-446655440001",
          name: "John Doe",
          work_date: "2026-09-06",
          is_active: true,
        },
      ],
    };
    const result = AdminAttendanceSummarySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  describe("Endpoints Security & Unauthenticated Responses", () => {
    it("GET /api/attendance/status returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/attendance/status"), mockEnv);
      expect(res.status).toBe(401);
    });

    it("POST /api/attendance/check-in returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/attendance/check-in", { method: "POST" }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("POST /api/attendance/check-out returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/attendance/check-out", { method: "POST" }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("GET /api/attendance/admin-summary returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/attendance/admin-summary"),
        mockEnv
      );
      expect(res.status).toBe(401);
    });
  });
});
