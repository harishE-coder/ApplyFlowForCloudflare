/**
 * Cloudflare Durable Object for Chat Room Coordination.
 * Co-locates all WebSockets for a single chat room into a single isolate.
 * Manages live broadcasts, presence, typing indicators, and 30-second heartbeats.
 * 
 * NOTE: The Neon PostgreSQL database remains the absolute source of truth
 * for message persistence, history, and read state.
 */

import type { Bindings } from "../types";

export interface SessionMeta {
  userId: string;
  name: string;
  role: string;
  lastSeen: number;
}

export class ChatRoomDO {
  state: DurableObjectState;
  env: Bindings;
  sessions: Map<WebSocket, SessionMeta>;

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 1. Internal broadcast endpoint for REST API worker
    // Called after inserting message into Neon PostgreSQL
    if (url.pathname.endsWith("/broadcast")) {
      const payload = await request.json().catch(() => null);
      if (payload) {
        this.broadcast(payload);
      }
      const onlineUserIds = Array.from(
        new Set(Array.from(this.sessions.values()).map((s) => s.userId))
      );
      return new Response(
        JSON.stringify({
          success: true,
          delivered_count: this.sessions.size,
          online_user_ids: onlineUserIds,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Query presence for recipient(s)
    if (url.pathname.endsWith("/is-user-online")) {
      const targetUserId = url.searchParams.get("user_id");
      const isOnline = Array.from(this.sessions.values()).some(
        (s) => s.userId === targetUserId
      );
      return new Response(JSON.stringify({ online: isOnline }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 3. WebSocket Upgrade
    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket Upgrade", { status: 426 });
    }

    const userId = request.headers.get("X-User-Id") || "";
    const userName = request.headers.get("X-User-Name") || "User";
    const userRole = request.headers.get("X-User-Role") || "user";

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.handleSession(server, {
      userId,
      name: userName,
      role: userRole,
      lastSeen: Date.now(),
    });

    // Schedule 30s heartbeat sweep alarm if not already scheduled
    try {
      const currentAlarm = await this.state.storage.getAlarm();
      if (!currentAlarm) {
        await this.state.storage.setAlarm(Date.now() + 30000);
      }
    } catch {}

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  // Durable Object Alarm: Sweeps dead connections with missed 30s heartbeats
  async alarm(): Promise<void> {
    const now = Date.now();
    let presenceChanged = false;

    for (const [ws, meta] of this.sessions.entries()) {
      // Disconnect if missed heartbeat (no ping/pong received within 35s)
      if (now - meta.lastSeen > 35000) {
        try {
          ws.close(1000, "Heartbeat timeout");
        } catch {}
        this.sessions.delete(ws);
        presenceChanged = true;
      }
    }

    if (presenceChanged) {
      this.broadcastPresence();
    }

    // Reschedule next 30s alarm while active sessions exist
    if (this.sessions.size > 0) {
      try {
        await this.state.storage.setAlarm(Date.now() + 30000);
      } catch {}
    }
  }

  handleSession(ws: WebSocket, meta: SessionMeta) {
    ws.accept();
    this.sessions.set(ws, meta);

    // Broadcast presence update when new user connects
    this.broadcastPresence();

    ws.addEventListener("message", (event) => {
      try {
        meta.lastSeen = Date.now();
        const data = JSON.parse(event.data as string);

        // 30s Heartbeat handling: Ping -> Pong -> Update presence
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          return;
        }

        if (data.type === "pong") {
          // Pong received from client keepalive
          return;
        }

        // Typing indicator
        if (data.type === "typing") {
          this.broadcast(
            {
              type: "typing",
              user_id: meta.userId,
              user_name: meta.name,
              is_typing: Boolean(data.is_typing),
            },
            ws
          );
          return;
        }

        // Read receipt
        if (data.type === "read") {
          this.broadcast({
            type: "read_receipt",
            message_id: data.message_id,
            user_id: meta.userId,
            user_name: meta.name,
          });
          return;
        }

        // Delivery acknowledgment
        if (data.type === "delivery_ack") {
          this.broadcast({
            type: "message_status",
            message_id: data.message_id,
            status: "delivered",
          });
          return;
        }
      } catch (err) {
        console.error("ChatRoomDO message handling error:", err);
      }
    });

    const closeHandler = () => {
      this.sessions.delete(ws);
      this.broadcastPresence();
    };

    ws.addEventListener("close", closeHandler);
    ws.addEventListener("error", closeHandler);
  }

  broadcast(data: any, excludeWs?: WebSocket) {
    const json = JSON.stringify(data);
    const now = Date.now();

    for (const [socket, meta] of this.sessions.entries()) {
      if (socket !== excludeWs) {
        // Disconnect sockets that missed heartbeats (> 35s)
        if (now - meta.lastSeen > 35000) {
          try {
            socket.close(1000, "Heartbeat timeout");
          } catch {}
          this.sessions.delete(socket);
          continue;
        }

        try {
          socket.send(json);
        } catch {
          this.sessions.delete(socket);
        }
      }
    }
  }

  broadcastPresence() {
    const onlineUserIds = Array.from(
      new Set(Array.from(this.sessions.values()).map((s) => s.userId))
    );
    this.broadcast({
      type: "presence",
      online_users: onlineUserIds,
    });
  }
}
