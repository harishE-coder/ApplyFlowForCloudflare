import { describe, expect, it, vi } from "vitest";
import { createAccessToken } from "../src/auth";
import { NotificationListResponseSchema } from "../src/schemas/notifications";
import type { Bindings, UserPayload } from "../src/types";

const mockUser: UserPayload = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  email: "user@applyflow.com",
  role: "employee",
  name: "Test User",
  is_active: true,
};

let lastExecutedQuery = "";
let lastQueryValues: any[] = [];

vi.mock("../src/db", () => {
  return {
    getDb: () => {
      return async (strings: TemplateStringsArray, ...values: any[]) => {
        lastExecutedQuery = strings.join("?");
        lastQueryValues = values;

        if (lastExecutedQuery.includes("FROM users")) {
          return [mockUser];
        }
        if (lastExecutedQuery.includes("DELETE FROM notifications")) {
          return [{ id: "notif-1" }];
        }
        if (lastExecutedQuery.includes("UPDATE notifications")) {
          return [{ id: "notif-1" }];
        }
        if (lastExecutedQuery.includes("SELECT COUNT(*)")) {
          return [{ count: 0 }];
        }
        if (lastExecutedQuery.includes("FROM notifications")) {
          return [];
        }
        return [];
      };
    },
  };
});

import app from "../src/index";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/exec",
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

    it("DELETE /api/notifications/clear-read returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/notifications/clear-read", { method: "DELETE" }),
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

  describe("Authenticated Endpoints & Route Precedence", () => {
    it("DELETE /api/notifications/clear-read clears all read notifications", async () => {
      const token = await createAccessToken(mockUser, mockEnv.JWT_SECRET_KEY, 60);
      const res = await app.fetch(
        new Request("http://localhost/api/notifications/clear-read", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }),
        mockEnv
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain("read notifications cleared");
      expect(lastExecutedQuery).toContain("WHERE user_id = ?");
      expect(lastExecutedQuery).toContain("AND is_read = true");
      expect(lastExecutedQuery).not.toContain("WHERE id = ?");
    });

    it("DELETE /api/notifications/clear-old?days=0 routes correctly without hitting /:id", async () => {
      const token = await createAccessToken(mockUser, mockEnv.JWT_SECRET_KEY, 60);
      const res = await app.fetch(
        new Request("http://localhost/api/notifications/clear-old?days=0", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }),
        mockEnv
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain("old notifications cleared");
      expect(lastExecutedQuery).toContain("WHERE user_id = ?");
      expect(lastExecutedQuery).toContain("AND is_read = true");
      // Must NOT be intercepted by the /:id route:
      expect(lastExecutedQuery).not.toContain("WHERE id = ?");
    });

    it("DELETE /api/notifications/clear-old?days=7 executes interval filter", async () => {
      const token = await createAccessToken(mockUser, mockEnv.JWT_SECRET_KEY, 60);
      const res = await app.fetch(
        new Request("http://localhost/api/notifications/clear-old?days=7", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }),
        mockEnv
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain("old notifications cleared");
      expect(lastExecutedQuery).toContain("::interval");
      expect(lastExecutedQuery).not.toContain("WHERE id = ?");
    });

    it("DELETE /api/notifications/:id routes single notification deletion", async () => {
      const token = await createAccessToken(mockUser, mockEnv.JWT_SECRET_KEY, 60);
      const singleId = "550e8400-e29b-41d4-a716-446655440000";
      const res = await app.fetch(
        new Request(`http://localhost/api/notifications/${singleId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }),
        mockEnv
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toBe("Notification deleted successfully");
      expect(lastExecutedQuery).toContain("WHERE id = ? AND user_id = ?");
      expect(lastQueryValues[0]).toBe(singleId);
    });
  });
});

