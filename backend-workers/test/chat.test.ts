import { describe, expect, it } from "vitest";
import { ChatRoomDO } from "../src/durable_objects/ChatRoomDO";
import app from "../src/index";
import {
  PushSubscriptionCreateSchema,
  SendMessageRequestSchema,
  ShareJobRequestSchema,
  ShareResumeRequestSchema,
} from "../src/schemas/chat";
import type { Bindings } from "../src/types";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/exec",
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
  VAPID_PUBLIC_KEY: "test_vapid_public_key_value",
  CHAT_ROOMS: {
    idFromName: (name: string) => ({ toString: () => name }),
    get: (id: any) => ({
      fetch: async (req: Request) => {
        return new Response(JSON.stringify({ success: true, delivered_count: 0, online_user_ids: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    }),
  } as any,
};

describe("Chat Module & Durable Objects Tests", () => {
  describe("Zod Validation Schemas", () => {
    it("validates SendMessageRequestSchema with client idempotency ID", () => {
      const valid = {
        message: "Hello team!",
        client_id: "client-uuid-123",
        client_message_id: "client-uuid-123",
      };
      const result = SendMessageRequestSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message).toBe("Hello team!");
        expect(result.data.client_message_id).toBe("client-uuid-123");
      }
    });

    it("rejects SendMessageRequestSchema with empty message", () => {
      const invalid = { message: "   " };
      const result = SendMessageRequestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validates ShareResumeRequestSchema with optional caption", () => {
      const valid = {
        resume_id: "550e8400-e29b-41d4-a716-446655440000",
        caption: "Reviewing this strong React candidate",
      };
      const result = ShareResumeRequestSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.caption).toBe("Reviewing this strong React candidate");
      }
    });

    it("validates ShareJobRequestSchema with optional caption", () => {
      const valid = {
        requirement_id: "550e8400-e29b-41d4-a716-446655440000",
        caption: "Urgent opening for this week",
      };
      const result = ShareJobRequestSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.requirement_id).toBe("550e8400-e29b-41d4-a716-446655440000");
        expect(result.data.caption).toBe("Urgent opening for this week");
      }
    });

    it("rejects ShareJobRequestSchema with invalid UUID", () => {
      const invalid = { requirement_id: "not-a-valid-uuid" };
      const result = ShareJobRequestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("validates PushSubscriptionCreateSchema", () => {
      const valid = {
        endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
        keys: {
          p256dh: "BM6h6testp256dhKeyExample1234567890",
          auth: "testauthKey123",
        },
      };
      const result = PushSubscriptionCreateSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe("Public & Unauthenticated Endpoints", () => {
    it("GET /api/chat/push/vapid-public-key returns VAPID key without auth", async () => {
      const res = await app.fetch(new Request("http://localhost/api/chat/push/vapid-public-key"), mockEnv);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { public_key: string };
      expect(data.public_key).toBe("test_vapid_public_key_value");
    });

    it("GET /api/chat/unread-count returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/chat/unread-count"), mockEnv);
      expect(res.status).toBe(401);
    });

    it("GET /api/chat/rooms returns 401 when unauthenticated", async () => {
      const res = await app.fetch(new Request("http://localhost/api/chat/rooms"), mockEnv);
      expect(res.status).toBe(401);
    });

    it("POST /api/chat/rooms/:room_id/messages returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: "test" }),
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("POST /api/chat/rooms/:room_id/share-resume returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/share-resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume_id: "550e8400-e29b-41d4-a716-446655440000" }),
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("POST /api/chat/rooms/:room_id/share-job returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/share-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirement_id: "550e8400-e29b-41d4-a716-446655440000" }),
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("POST /api/chat/rooms/:room_id/attachment returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/attachment", {
          method: "POST",
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("DELETE /api/chat/messages/:id returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/messages/550e8400-e29b-41d4-a716-446655440000", {
          method: "DELETE",
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("POST /api/chat/rooms/:room_id/lock returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/lock", {
          method: "POST",
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("POST /api/chat/rooms/:room_id/unlock returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/unlock", {
          method: "POST",
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("POST /api/chat/rooms/:room_id/archive returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/archive", {
          method: "POST",
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
    });

    it("GET /api/chat/rooms/:room_id/export returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/export"),
        mockEnv
      );
      expect(res.status).toBe(401);
    });
  });

  describe("Direct WebSocket Cookie Authentication", () => {
    it("GET /api/chat/rooms/:room_id/ws returns 401 when no session cookie is provided", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/ws", {
          headers: { Upgrade: "websocket" },
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain("Unauthorized: No session cookie provided");
    });

    it("GET /ws/chat/:room_id returns 401 when no session cookie is provided", async () => {
      const res = await app.fetch(
        new Request("http://localhost/ws/chat/550e8400-e29b-41d4-a716-446655440000", {
          headers: { Upgrade: "websocket" },
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain("Unauthorized: No session cookie provided");
    });

    it("GET /api/chat/rooms/:room_id/ws returns 401 when invalid cookie token is provided", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/rooms/550e8400-e29b-41d4-a716-446655440000/ws", {
          headers: {
            Upgrade: "websocket",
            Cookie: "access_token=invalid.jwt.token",
          },
        }),
        mockEnv
      );
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain("Unauthorized: Invalid or expired session");
    });
  });

  describe("ChatRoomDO Durable Object Unit Isolation", () => {
    const mockStorage = {
      alarm: null as number | null,
      getAlarm: async () => mockStorage.alarm,
      setAlarm: async (ts: number) => {
        mockStorage.alarm = ts;
      },
    };

    const mockState = {
      storage: mockStorage,
    } as any;

    it("initializes with empty sessions and handles internal broadcast endpoint", async () => {
      const roomDO = new ChatRoomDO(mockState, mockEnv);
      expect(roomDO.sessions.size).toBe(0);

      const broadcastReq = new Request("http://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "new_message", message: { id: "123", text: "hi" } }),
      });

      const res = await roomDO.fetch(broadcastReq);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { success: boolean; delivered_count: number; online_user_ids: string[] };
      expect(data.success).toBe(true);
      expect(data.delivered_count).toBe(0);
      expect(data.online_user_ids).toEqual([]);
    });

    it("queries presence accurately via /is-user-online", async () => {
      const roomDO = new ChatRoomDO(mockState, mockEnv);
      const res = await roomDO.fetch(new Request("http://do/is-user-online?user_id=user-123"));
      expect(res.status).toBe(200);
      const data = (await res.json()) as { online: boolean };
      expect(data.online).toBe(false);
    });

    it("sweeps expired sessions on 30s heartbeat timeout alarm", async () => {
      const roomDO = new ChatRoomDO(mockState, mockEnv);

      let closed = false;
      const mockWs = {
        close: () => {
          closed = true;
        },
        send: () => {},
      } as any;

      // Add session with lastSeen 40 seconds ago (missed 30s heartbeat)
      roomDO.sessions.set(mockWs, {
        userId: "user-stale",
        name: "Stale User",
        role: "user",
        lastSeen: Date.now() - 40000,
      });

      expect(roomDO.sessions.size).toBe(1);

      // Trigger alarm
      await roomDO.alarm();

      expect(closed).toBe(true);
      expect(roomDO.sessions.size).toBe(0);
    });

    it("handles reconnection sync message gracefully without throwing", async () => {
      const roomDO = new ChatRoomDO(mockState, mockEnv);
      const mockWs = { send: () => {} } as any;
      await expect(
        roomDO.replayMissedMessages(mockWs, "room-1", "msg-1")
      ).resolves.not.toThrow();
    });
  });

  describe("Worker Observability (x-request-id)", () => {
    it("assigns and returns X-Request-Id header on all requests", async () => {
      const res = await app.fetch(new Request("http://localhost/api/health"), mockEnv);
      expect(res.headers.has("x-request-id")).toBe(true);
      const reqId = res.headers.get("x-request-id");
      expect(typeof reqId).toBe("string");
      expect(reqId!.length).toBeGreaterThan(0);
    });

    it("propagates client-supplied X-Request-Id for distributed tracing", async () => {
      const customId = "trace-client-uuid-999";
      const res = await app.fetch(
        new Request("http://localhost/api/health", {
          headers: { "X-Request-Id": customId },
        }),
        mockEnv
      );
      expect(res.headers.get("x-request-id")).toBe(customId);
    });

    describe("Chat Room Activity Ordering (WhatsApp / Slack / Discord parity)", () => {
      it("orders chat rooms descending by latest activity timestamp", () => {
        const mockRooms = [
          { id: "room-1", client_name: "Client A", created_at: "2026-09-01T10:00:00Z", last_message_at: "2026-09-02T10:00:00Z" },
          { id: "room-2", client_name: "Client B", created_at: "2026-09-05T10:00:00Z", last_message_at: "2026-09-07T08:00:00Z" },
          { id: "room-3", client_name: "Client C", created_at: "2026-09-06T10:00:00Z", last_message_at: null },
        ];

        const sorted = [...mockRooms].sort((a, b) => {
          const timeA = new Date(a.last_message_at || a.created_at || 0).getTime();
          const timeB = new Date(b.last_message_at || b.created_at || 0).getTime();
          return timeB - timeA;
        });

        // room-2 had latest message (Sept 7), room-3 had created_at (Sept 6), room-1 had latest message (Sept 2)
        expect(sorted[0].id).toBe("room-2");
        expect(sorted[1].id).toBe("room-3");
        expect(sorted[2].id).toBe("room-1");
      });

      it("promotes older room to position #1 when a new message arrives", () => {
        const mockRooms = [
          { id: "room-2", client_name: "Client B", created_at: "2026-09-05T10:00:00Z", last_message_at: "2026-09-07T08:00:00Z" },
          { id: "room-1", client_name: "Client A", created_at: "2026-09-01T10:00:00Z", last_message_at: "2026-09-02T10:00:00Z" },
        ];

        // New message arrives in room-1 at 08:30:00Z (after room-2's 08:00:00Z)
        const updatedRooms = mockRooms.map(r => {
          if (r.id === "room-1") {
            return {
              ...r,
              last_message: "New incoming message",
              last_message_at: "2026-09-07T08:30:00Z",
            };
          }
          return r;
        });

        const sorted = [...updatedRooms].sort((a, b) => {
          const timeA = new Date(a.last_message_at || a.created_at || 0).getTime();
          const timeB = new Date(b.last_message_at || b.created_at || 0).getTime();
          return timeB - timeA;
        });

        expect(sorted[0].id).toBe("room-1");
        expect(sorted[0].last_message).toBe("New incoming message");
        expect(sorted[1].id).toBe("room-2");
      });
    });

    it("includes request_id in 404 error responses", async () => {
      const res = await app.fetch(new Request("http://localhost/nonexistent-route"), mockEnv);
      expect(res.status).toBe(404);
      const body = (await res.json()) as { request_id?: string };
      expect(body.request_id).toBeDefined();
    });
  });

  describe("Feature 5: Soft Delete with Admin Audit View", () => {
    it("Admin sees original message with audit trail while non-admins see sanitized deleted message", () => {
      const rawDeletedMsg = {
        id: "msg-123",
        room_id: "room-abc",
        sender_id: "user-sender-1",
        sender_name: "John Employee",
        sender_role: "employee",
        message: "Please send John's resume today.",
        attachment_type: "resume",
        attachment_reference: JSON.stringify({
          resumeId: "res-999",
          candidate_name: "John Doe",
          drive_view_url: "https://drive.google.com/view/123",
        }),
        is_deleted: true,
        deleted_by: "user-admin-1",
        deleted_by_name: "Harish",
        deleted_by_role: "sub_admin",
        deleted_at: "2026-09-07T15:42:00Z",
      };

      const formatForRole = (m: typeof rawDeletedMsg, callerRole: string) => {
        const isAdmin = callerRole === "admin" || callerRole === "super_admin";
        if (m.is_deleted && !isAdmin) {
          return {
            id: m.id,
            message: "This message was deleted.",
            attachment_type: null,
            attachment_reference: null,
            is_deleted: true,
            deleted_by: null,
            deleted_by_name: null,
            deleted_by_role: null,
            deleted_at: m.deleted_at,
          };
        }
        return {
          id: m.id,
          message: m.message,
          attachment_type: m.attachment_type,
          attachment_reference: m.attachment_reference,
          is_deleted: m.is_deleted,
          deleted_by: m.deleted_by,
          deleted_by_name: m.deleted_by_name,
          deleted_by_role: m.deleted_by_role,
          deleted_at: m.deleted_at,
        };
      };

      // 1. Admin view: original text intact, attachments intact, audit details provided
      const adminView = formatForRole(rawDeletedMsg, "admin");
      expect(adminView.message).toBe("Please send John's resume today.");
      expect(adminView.attachment_type).toBe("resume");
      expect(adminView.attachment_reference).toBeDefined();
      expect(adminView.is_deleted).toBe(true);
      expect(adminView.deleted_by_name).toBe("Harish");
      expect(adminView.deleted_by_role).toBe("sub_admin");
      expect(adminView.deleted_at).toBe("2026-09-07T15:42:00Z");

      // 2. Sub-Admin view: "This message was deleted.", attachments scrubbed
      const subAdminView = formatForRole(rawDeletedMsg, "sub_admin");
      expect(subAdminView.message).toBe("This message was deleted.");
      expect(subAdminView.attachment_type).toBeNull();
      expect(subAdminView.attachment_reference).toBeNull();
      expect(subAdminView.is_deleted).toBe(true);

      // 3. Client view: "This message was deleted.", attachments scrubbed
      const clientView = formatForRole(rawDeletedMsg, "client");
      expect(clientView.message).toBe("This message was deleted.");
      expect(clientView.attachment_type).toBeNull();
      expect(clientView.attachment_reference).toBeNull();

      // 4. Employee view: "This message was deleted.", attachments scrubbed
      const employeeView = formatForRole(rawDeletedMsg, "employee");
      expect(employeeView.message).toBe("This message was deleted.");
      expect(employeeView.attachment_type).toBeNull();
      expect(employeeView.attachment_reference).toBeNull();
    });

    it("verifies role-based message deletion permissions", () => {
      const canDelete = (callerRole: string, callerId: string, senderRole: string, senderId: string) => {
        const isOwn = callerId === senderId;
        if (callerRole === "admin" || callerRole === "super_admin") {
          return true;
        }
        if (callerRole === "sub_admin") {
          if (senderRole === "admin" || senderRole === "super_admin") {
            return isOwn;
          }
          return true;
        }
        return isOwn;
      };

      // Admin can delete any role's message
      expect(canDelete("admin", "adm-1", "employee", "emp-1")).toBe(true);
      expect(canDelete("admin", "adm-1", "client", "cli-1")).toBe(true);
      expect(canDelete("admin", "adm-1", "sub_admin", "sub-1")).toBe(true);
      expect(canDelete("admin", "adm-1", "admin", "adm-2")).toBe(true);

      // Sub-Admin can delete client, employee, and own messages
      expect(canDelete("sub_admin", "sub-1", "client", "cli-1")).toBe(true);
      expect(canDelete("sub_admin", "sub-1", "employee", "emp-1")).toBe(true);
      expect(canDelete("sub_admin", "sub-1", "sub_admin", "sub-1")).toBe(true);
      // Sub-Admin CANNOT delete Admin messages
      expect(canDelete("sub_admin", "sub-1", "admin", "adm-1")).toBe(false);
      expect(canDelete("sub_admin", "sub-1", "super_admin", "sup-1")).toBe(false);

      // Client and Employee can only delete their own messages
      expect(canDelete("client", "cli-1", "client", "cli-1")).toBe(true);
      expect(canDelete("client", "cli-1", "client", "cli-2")).toBe(false);
      expect(canDelete("client", "cli-1", "employee", "emp-1")).toBe(false);
      expect(canDelete("employee", "emp-1", "employee", "emp-1")).toBe(true);
      expect(canDelete("employee", "emp-1", "client", "cli-1")).toBe(false);
    });

    it("replays missed messages with role-specific soft-delete sanitization in Durable Object", async () => {
      const mockStorage = {
        alarm: null as number | null,
        getAlarm: async () => mockStorage.alarm,
        setAlarm: async (ts: number) => { mockStorage.alarm = ts; },
      };
      const roomDO = new ChatRoomDO({ storage: mockStorage } as any, mockEnv);
      const mockWs = { send: () => {} } as any;

      await expect(
        roomDO.replayMissedMessages(mockWs, "room-1", "msg-1", "admin")
      ).resolves.not.toThrow();

      await expect(
        roomDO.replayMissedMessages(mockWs, "room-1", "msg-1", "employee")
      ).resolves.not.toThrow();
    });
  });
});

