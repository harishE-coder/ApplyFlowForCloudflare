import { describe, expect, it } from "vitest";
import app from "../src/index";
import type { Bindings } from "../src/types";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  RESUMES_BUCKET: {} as any,
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
  VAPID_PUBLIC_KEY: "test_vapid_public_key",
  CHAT_ROOMS: {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => ({
      fetch: async () =>
        new Response(JSON.stringify({ success: true, delivered_count: 0, online_user_ids: [] }), {
          headers: { "Content-Type": "application/json" },
        }),
    }),
  } as any,
};

describe("Comprehensive API Surface & Parity Verification (FastAPI -> Cloudflare Workers)", () => {
  const testEndpoints: Array<{
    name: string;
    path: string;
    method?: string;
    expectedStatus: number;
    headers?: Record<string, string>;
  }> = [
    // 1. Health
    { name: "Health Check", path: "/api/health", expectedStatus: 200 },

    // 2. Auth Module
    { name: "Auth - Me (unauth)", path: "/api/auth/me", expectedStatus: 401 },
    { name: "Auth - Bootstrap (unauth)", path: "/api/auth/bootstrap", expectedStatus: 401 },
    { name: "Auth - Logout", path: "/api/auth/logout", method: "POST", expectedStatus: 200 },

    // 3. Dashboard Module
    { name: "Dashboard - Stats (unauth)", path: "/api/dashboard/stats", expectedStatus: 401 },

    // 4. Clients Module
    { name: "Clients - List (unauth)", path: "/api/clients", expectedStatus: 401 },
    { name: "Clients - Create (unauth)", path: "/api/clients", method: "POST", expectedStatus: 401 },

    // 5. Employees Module
    { name: "Employees - List (unauth)", path: "/api/employees", expectedStatus: 401 },
    { name: "Employees - Users (unauth)", path: "/api/users", expectedStatus: 401 },

    // 6. Requirements Module
    { name: "Requirements - List (unauth)", path: "/api/requirements", expectedStatus: 401 },

    // 7. Applications Module
    { name: "Applications - List (unauth)", path: "/api/applications", expectedStatus: 401 },
    { name: "Applications - Classify Email (unauth)", path: "/api/applications/classify-email", method: "POST", expectedStatus: 401 },

    // 8. Resumes & R2 Storage Module
    { name: "Resumes - List (unauth)", path: "/api/resumes", expectedStatus: 401 },
    { name: "Resumes - Companies (unauth)", path: "/api/resumes/companies", expectedStatus: 401 },
    { name: "Resumes - Upload (unauth)", path: "/api/resumes/upload", method: "POST", expectedStatus: 401 },
    { name: "Resumes - Preview (unauth)", path: "/api/resumes/550e8400-e29b-41d4-a716-446655440000/preview", expectedStatus: 401 },
    { name: "Resumes - Download (unauth)", path: "/api/resumes/550e8400-e29b-41d4-a716-446655440000/download", expectedStatus: 401 },

    // 9. Notifications Module
    { name: "Notifications - List (unauth)", path: "/api/notifications", expectedStatus: 401 },
    { name: "Notifications - Mark Read (unauth)", path: "/api/notifications/550e8400-e29b-41d4-a716-446655440000/read", method: "POST", expectedStatus: 401 },
    { name: "Notifications - Read All (unauth)", path: "/api/notifications/read-all", method: "POST", expectedStatus: 401 },

    // 10. Attendance Module
    { name: "Attendance - Status (unauth)", path: "/api/attendance/status", expectedStatus: 401 },
    { name: "Attendance - Check-In (unauth)", path: "/api/attendance/check-in", method: "POST", expectedStatus: 401 },
    { name: "Attendance - Check-Out (unauth)", path: "/api/attendance/check-out", method: "POST", expectedStatus: 401 },
    { name: "Attendance - Admin Summary (unauth)", path: "/api/attendance/admin-summary", expectedStatus: 401 },

    // 11. Targets Module
    { name: "Targets - List (unauth)", path: "/api/targets", expectedStatus: 401 },
    { name: "Targets - Progress (unauth)", path: "/api/targets/progress", expectedStatus: 401 },

    // 12. Chat & Real-Time Sync Module
    { name: "Chat - VAPID Key (public)", path: "/api/chat/push/vapid-public-key", expectedStatus: 200 },
    { name: "Chat - Unread Count (unauth)", path: "/api/chat/unread-count", expectedStatus: 401 },
    { name: "Chat - Rooms (unauth)", path: "/api/chat/rooms", expectedStatus: 401 },
    { name: "Chat - Room Messages (unauth)", path: "/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/messages", expectedStatus: 401 },
    { name: "Chat - Send Message (unauth)", path: "/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/messages", method: "POST", expectedStatus: 401 },
    { name: "Chat - WebSocket Native Route (unauth)", path: "/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/ws", headers: { Upgrade: "websocket" }, expectedStatus: 401 },
    { name: "Chat - WebSocket Dual Route (unauth)", path: "/ws/chat/550e8400-e29b-41d4-a716-446655440000", headers: { Upgrade: "websocket" }, expectedStatus: 401 },
  ];

  for (const ep of testEndpoints) {
    it(`verifies contract for ${ep.name} -> ${ep.method || "GET"} ${ep.path}`, async () => {
      const headers: Record<string, string> = { ...(ep.headers || {}) };
      if (ep.method === "POST" && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }

      const req = new Request(`http://localhost${ep.path}`, {
        method: ep.method || "GET",
        headers,
      });

      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(ep.expectedStatus);
    });
  }
});
