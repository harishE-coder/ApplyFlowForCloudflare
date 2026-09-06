import { describe, expect, it } from "vitest";
import app from "../src/index";
import { NotificationListResponseSchema } from "../src/schemas/notifications";
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

describe("Notifications Module Tests", () => {
  it("validates NotificationListResponseSchema", () => {
    const valid = {
      unread_count: 3,
      items: [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          user_id: "550e8400-e29b-41d4-a716-446655440001",
          title: "New Application Received",
          message: "John Doe applied for SDE 2 role",
          type: "application",
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ],
    };
    const result = NotificationListResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  describe("Endpoints Security & Unauthenticated Responses", () => {
    it("GET /api/notifications returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/notifications"), mockEnv);
      expect(res.status).toBe(401);
    });

    it("POST /api/notifications/:id/read returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/notifications/550e8400-e29b-41d4-a716-446655440000/read", {
          method: "POST",
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("POST /api/notifications/read-all returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/notifications/read-all", { method: "POST" }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("DELETE /api/notifications/:id returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/notifications/550e8400-e29b-41d4-a716-446655440000", {
          method: "DELETE",
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("DELETE /api/notifications/clear-old returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/notifications/clear-old", { method: "DELETE" }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });
  });
});
