import { describe, expect, it, vi } from "vitest";
import { createAccessToken } from "../src/auth";
import type { Bindings } from "../src/types";

const mockRooms = [
  {
    id: "room-older-created-recent-message",
    client_id: "client-1",
    client_name: "Hari Prakash",
    status: "active",
    created_at: "2026-08-01T00:00:00Z",
    last_message_at: "2026-09-07T08:00:00Z",
  },
  {
    id: "room-recent-created-no-message",
    client_id: "client-2",
    client_name: "Sreya Suresh",
    status: "active",
    created_at: "2026-09-05T00:00:00Z",
    last_message_at: null,
  },
  {
    id: "room-oldest",
    client_id: "client-3",
    client_name: "Global Tech",
    status: "active",
    created_at: "2026-07-01T00:00:00Z",
    last_message_at: "2026-07-02T00:00:00Z",
  },
];

vi.mock("../src/db", () => {
  return {
    getDb: () => {
      return async (strings: TemplateStringsArray, ...values: any[]) => {
        const queryText = strings.join("?");

        if (queryText.includes("FROM users") && queryText.includes("WHERE id =")) {
          return [
            {
              id: "admin-id",
              name: "Admin User",
              email: "admin@applyflow.com",
              role: "admin",
              client_id: null,
              is_active: true,
            },
          ];
        }
        if (queryText.includes("FROM chat_rooms r")) {
          return mockRooms;
        }
        if (queryText.includes("FROM chat_messages m") && queryText.includes("LIMIT 1")) {
          const roomId = values[0];
          if (roomId === "room-older-created-recent-message") {
            return [{ message: "Latest update from Hari Prakash", sender_name: "Hari", created_at: "2026-09-07T08:00:00Z" }];
          }
          if (roomId === "room-oldest") {
            return [{ message: "Old chat", sender_name: "Admin", created_at: "2026-07-02T00:00:00Z" }];
          }
          return [];
        }
        if (queryText.includes("COUNT(m.id)::int as count")) {
          return [{ count: 0 }];
        }
        if (queryText.includes("FROM users u")) {
          return [{ id: "user-1", name: "Hari", role: "client" }];
        }
        if (queryText.includes("FROM sub_admin_assignments")) {
          return [{ client_id: "client-1" }];
        }
        if (queryText.includes("FROM employee_clients")) {
          return [{ client_id: "client-1" }];
        }

        return [];
      };
    },
  };
});

import app from "../src/index";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "super-secret-jwt-key-for-testing-only-1234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/exec",
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
  VAPID_PUBLIC_KEY: "test_vapid_key",
  CHAT_ROOMS: {
    idFromName: (name: string) => ({ toString: () => name }),
    get: () => ({
      fetch: async () => new Response(JSON.stringify({ success: true })),
    }),
  } as any,
};

describe("Chat Rooms Activity Ordering Integration Test", () => {
  it("returns rooms sorted by latest activity descending (WhatsApp/Slack order)", async () => {
    const adminToken = await createAccessToken(
      {
        id: "admin-id",
        role: "admin",
        email: "admin@applyflow.com",
        name: "Admin User",
        client_id: null,
      },
      mockEnv.JWT_SECRET_KEY
    );

    const res = await app.fetch(
      new Request("http://localhost/api/chat/rooms", {
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      }),
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: any[]; total_unread: number };
    expect(body.items).toBeDefined();
    expect(body.items.length).toBe(3);

    // Verify ordering:
    // 1st: room-older-created-recent-message (latest activity: Sept 7)
    // 2nd: room-recent-created-no-message (latest activity: Sept 5 created_at)
    // 3rd: room-oldest (latest activity: July 2)
    expect(body.items[0].id).toBe("room-older-created-recent-message");
    expect(body.items[0].last_message).toBe("Latest update from Hari Prakash");
    expect(body.items[0].last_message_at).toBe("2026-09-07T08:00:00Z");

    expect(body.items[1].id).toBe("room-recent-created-no-message");
    expect(body.items[2].id).toBe("room-oldest");
  });

  it("GET /api/chat/unread-count returns scoped count for admin", async () => {
    const adminToken = await createAccessToken(
      {
        id: "admin-id",
        role: "admin",
        email: "admin@applyflow.com",
        name: "Admin User",
        client_id: null,
      },
      mockEnv.JWT_SECRET_KEY
    );

    const res = await app.fetch(
      new Request("http://localhost/api/chat/unread-count", {
        headers: {
          Cookie: `access_token=${adminToken}`,
        },
      }),
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { total_unread: number; unread_count: number };
    expect(body.total_unread).toBe(0);
    expect(body.unread_count).toBe(0);
  });

  it("GET /api/chat/unread-count returns 0 for client without client_id", async () => {
    const clientToken = await createAccessToken(
      {
        id: "client-no-cid-id",
        role: "client",
        email: "client@example.com",
        name: "Unassigned Client",
        client_id: null,
      },
      mockEnv.JWT_SECRET_KEY
    );

    const res = await app.fetch(
      new Request("http://localhost/api/chat/unread-count", {
        headers: {
          Cookie: `access_token=${clientToken}`,
        },
      }),
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { total_unread: number; unread_count: number };
    expect(body.total_unread).toBe(0);
    expect(body.unread_count).toBe(0);
  });
});

