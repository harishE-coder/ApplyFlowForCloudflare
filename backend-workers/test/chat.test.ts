import { describe, expect, it } from "vitest";
import { ChatRoomDO } from "../src/durable_objects/ChatRoomDO";
import app from "../src/index";
import {
  PushSubscriptionCreateSchema,
  SendMessageRequestSchema,
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

    it("validates ShareResumeRequestSchema", () => {
      const valid = { resume_id: "550e8400-e29b-41d4-a716-446655440000" };
      const result = ShareResumeRequestSchema.safeParse(valid);
      expect(result.success).toBe(true);
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

    it("DELETE /api/chat/messages/:id returns 401 when unauthenticated", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/chat/messages/550e8400-e29b-41d4-a716-446655440000", {
          method: "DELETE",
        }),
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

    it("includes request_id in 404 error responses", async () => {
      const res = await app.fetch(new Request("http://localhost/nonexistent-route"), mockEnv);
      expect(res.status).toBe(404);
      const body = (await res.json()) as { request_id?: string };
      expect(body.request_id).toBeDefined();
    });
  });
});
