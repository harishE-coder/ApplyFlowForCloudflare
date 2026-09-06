import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken } from "../auth";
import { getDb } from "../db";
import { requireAuth } from "../middleware/auth";
import {
  MarkReadRequestSchema,
  NotificationPreferencesUpdateSchema,
  PushSubscriptionCreateSchema,
  PushUnsubscribeRequestSchema,
  SendMessageRequestSchema,
  ShareResumeRequestSchema,
} from "../schemas/chat";
import type { Bindings, Variables } from "../types";

export const chatRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 1. GET /api/chat/push/vapid-public-key
chatRouter.get("/push/vapid-public-key", async (c) => {
  return c.json({
    public_key: c.env.VAPID_PUBLIC_KEY || "BH_example_vapid_public_key_for_testing",
  });
});

// 2. POST /api/chat/push/subscribe
chatRouter.post("/push/subscribe", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parseResult = PushSubscriptionCreateSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      { detail: parseResult.error.issues[0]?.message || "Validation error" },
      400
    );
  }

  const { endpoint, keys } = parseResult.data;
  const sql = getDb(c.env.DATABASE_URL);

  const existing = await sql`
    SELECT id FROM push_subscriptions WHERE endpoint = ${endpoint} LIMIT 1
  `;

  if (existing.length > 0) {
    await sql`
      UPDATE push_subscriptions
      SET user_id = ${user.id}, p256dh = ${keys.p256dh}, auth = ${keys.auth}, created_at = NOW()
      WHERE endpoint = ${endpoint}
    `;
  } else {
    const newId = crypto.randomUUID();
    await sql`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
      VALUES (${newId}, ${user.id}, ${endpoint}, ${keys.p256dh}, ${keys.auth}, NOW())
    `;
  }

  return c.json({ success: true, endpoint });
});

// 3. DELETE /api/chat/push/unsubscribe
chatRouter.delete("/push/unsubscribe", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parseResult = PushUnsubscribeRequestSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json({ detail: "Invalid endpoint" }, 400);
  }

  const sql = getDb(c.env.DATABASE_URL);
  await sql`
    DELETE FROM push_subscriptions
    WHERE user_id = ${user.id} AND endpoint = ${parseResult.data.endpoint}
  `;

  return c.json({ success: true });
});

// 4. GET /api/chat/preferences, PUT /api/chat/preferences & PATCH /api/chat/preferences
chatRouter.get("/preferences", requireAuth, async (c) => {
  return c.json({
    chat_notifications_enabled: true,
    sound_enabled: true,
    chat_push: true,
    email_notifications: true,
    muted_rooms: [],
  });
});

const handleUpdatePreferences = async (c: any) => {
  const body = await c.req.json().catch(() => ({}));
  const parseResult = NotificationPreferencesUpdateSchema.safeParse(body);
  return c.json({
    chat_notifications_enabled: parseResult.data?.chat_notifications_enabled ?? true,
    sound_enabled: parseResult.data?.sound_enabled ?? true,
    chat_push: true,
    email_notifications: true,
    muted_rooms: [],
  });
};

chatRouter.put("/preferences", requireAuth, handleUpdatePreferences);
chatRouter.patch("/preferences", requireAuth, handleUpdatePreferences);

// 5. GET /api/chat/unread-count (uses optimized indexed join)
chatRouter.get("/unread-count", requireAuth, async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`
    SELECT COUNT(m.id)::int as count
    FROM chat_messages m
    JOIN chat_rooms r ON r.id = m.room_id
    LEFT JOIN chat_reads cr ON cr.room_id = m.room_id AND cr.user_id = ${user.id}
    WHERE (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
      AND (m.sender_id IS NULL OR m.sender_id != ${user.id})
  `;

  const count = rows[0]?.count || 0;
  return c.json({
    total_unread: count,
    unread_count: count,
  });
});

// 6. GET /api/chat/rooms
chatRouter.get("/rooms", requireAuth, async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  let allowedClientIds: string[] | null = null;
  if (user.role === "client") {
    allowedClientIds = user.client_id ? [user.client_id] : [];
  } else if (user.role === "employee" || user.role === "recruiter") {
    const assigned = await sql`
      SELECT client_id FROM employee_clients WHERE employee_id = ${user.id} AND active = true
    `;
    const cids = assigned.map((r: any) => String(r.client_id));
    if (cids.length > 0) {
      allowedClientIds = cids;
    } else {
      const active = await sql`SELECT id FROM clients WHERE status = 'active'`;
      allowedClientIds = active.map((r: any) => String(r.id));
    }
  }

  let rooms: any[];
  if (allowedClientIds !== null && allowedClientIds.length === 0) {
    return c.json({ items: [], total_unread: 0 });
  } else if (allowedClientIds !== null) {
    rooms = await sql`
      SELECT r.id, r.client_id, c.company_name as client_name, r.status, r.created_at
      FROM chat_rooms r
      JOIN clients c ON c.id = r.client_id
      WHERE r.client_id = ANY(${allowedClientIds})
      ORDER BY r.created_at DESC
    `;
  } else {
    rooms = await sql`
      SELECT r.id, r.client_id, c.company_name as client_name, r.status, r.created_at
      FROM chat_rooms r
      JOIN clients c ON c.id = r.client_id
      ORDER BY r.created_at DESC
    `;
  }

  let totalUnread = 0;
  const items = [];

  for (const r of rooms) {
    const [latestMsg, unreadRes, participants] = await Promise.all([
      sql`
        SELECT m.message, u.name as sender_name, m.created_at
        FROM chat_messages m
        LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.room_id = ${r.id}
        ORDER BY m.created_at DESC
        LIMIT 1
      `,
      sql`
        SELECT COUNT(m.id)::int as count
        FROM chat_messages m
        LEFT JOIN chat_reads cr ON cr.room_id = ${r.id} AND cr.user_id = ${user.id}
        WHERE m.room_id = ${r.id}
          AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
          AND (m.sender_id IS NULL OR m.sender_id != ${user.id})
      `,
      sql`
        SELECT u.id, u.name, u.role
        FROM users u
        WHERE (u.client_id = ${r.client_id} AND u.role = 'client')
           OR u.id IN (SELECT employee_id FROM employee_clients WHERE client_id = ${r.client_id} AND active = true)
        LIMIT 10
      `,
    ]);

    const unread = unreadRes[0]?.count || 0;
    totalUnread += unread;

    items.push({
      id: r.id,
      client_id: r.client_id,
      client_name: r.client_name,
      participants: participants.map((p: any) => ({
        id: p.id,
        name: p.name,
        role: p.role,
      })),
      last_message: latestMsg[0]?.message || null,
      last_message_sender: latestMsg[0]?.sender_name || null,
      last_message_at: latestMsg[0]?.created_at || null,
      unread_count: unread,
    });
  }

  return c.json({ items, total_unread: totalUnread });
});

// 7. GET /api/chat/rooms/:room_id/messages (fast index on room_id, created_at DESC)
chatRouter.get("/rooms/:room_id/messages", requireAuth, async (c) => {
  const roomId = c.req.param("room_id");
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 50)));
  const offset = Math.max(0, Number(c.req.query("offset") || 0));
  const beforeId = c.req.query("before_id");
  const sql = getDb(c.env.DATABASE_URL);

  let messages: any[];
  if (beforeId) {
    const beforeMsg = await sql`SELECT created_at FROM chat_messages WHERE id = ${beforeId} LIMIT 1`;
    const beforeCreatedAt = beforeMsg[0]?.created_at;
    if (beforeCreatedAt) {
      messages = await sql`
        SELECT
          m.id, m.room_id, m.sender_id, m.message, m.attachment_type,
          m.attachment_reference, m.attachment_filename, m.client_message_id,
          m.created_at, m.edited_at,
          u.name as sender_name, u.role as sender_role
        FROM chat_messages m
        LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.room_id = ${roomId} AND m.created_at < ${beforeCreatedAt}
        ORDER BY m.created_at DESC
        LIMIT ${limit}
      `;
    } else {
      messages = [];
    }
  } else {
    messages = await sql`
      SELECT
        m.id, m.room_id, m.sender_id, m.message, m.attachment_type,
        m.attachment_reference, m.attachment_filename, m.client_message_id,
        m.created_at, m.edited_at,
        u.name as sender_name, u.role as sender_role
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = ${roomId}
      ORDER BY m.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  const countRes = await sql`
    SELECT COUNT(*)::int as count
    FROM chat_messages
    WHERE room_id = ${roomId}
  `;
  const total = countRes[0]?.count || 0;

  const items = messages.map((m: any) => ({
    id: m.id,
    room_id: m.room_id,
    sender: {
      id: m.sender_id,
      name: m.sender_name || "Deleted User",
      role: m.sender_role || "user",
    },
    message: m.message,
    attachment_type: m.attachment_type,
    attachment_reference: m.attachment_reference,
    attachment_filename: m.attachment_filename,
    client_id: m.client_message_id,
    status: "delivered",
    created_at: m.created_at,
    edited_at: m.edited_at,
    is_deleted: false,
  }));

  items.reverse();

  return c.json({
    items,
    total,
    has_more: offset + limit < total,
  });
});

// 8. POST /api/chat/rooms/:room_id/messages
// Architectural Rule: Neon PostgreSQL is the Source of Truth.
// Order: Insert into Neon -> Broadcast from DO -> If Recipient Offline -> Push Notification
chatRouter.post("/rooms/:room_id/messages", requireAuth, async (c) => {
  const roomId = c.req.param("room_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = SendMessageRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      { detail: parseResult.error.issues[0]?.message || "Validation error" },
      400
    );
  }

  const { message, client_id, client_message_id, attachment_type, attachment_reference, attachment_filename } =
    parseResult.data;
  const clientMessageId = client_message_id || client_id || null;
  const sql = getDb(c.env.DATABASE_URL);

  // Message Idempotency: Prevent duplicate messages from network retries or double-clicks
  if (clientMessageId) {
    const existing = await sql`
      SELECT
        m.id, m.room_id, m.sender_id, m.message, m.attachment_type,
        m.attachment_reference, m.attachment_filename, m.client_message_id,
        m.created_at, m.edited_at,
        u.name as sender_name, u.role as sender_role
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.room_id = ${roomId} AND m.client_message_id = ${clientMessageId}
      LIMIT 1
    `;

    if (existing.length > 0) {
      const m = existing[0];
      return c.json({
        id: m.id,
        room_id: m.room_id,
        sender: {
          id: m.sender_id,
          name: m.sender_name || user.name,
          role: m.sender_role || user.role,
        },
        message: m.message,
        attachment_type: m.attachment_type,
        attachment_reference: m.attachment_reference,
        attachment_filename: m.attachment_filename,
        client_id: m.client_message_id,
        status: "sent",
        created_at: m.created_at,
        edited_at: m.edited_at,
        is_deleted: false,
      });
    }
  }

  // STEP 1: Insert into Neon PostgreSQL (Source of Truth)
  const messageId = crypto.randomUUID();
  await sql`
    INSERT INTO chat_messages (
      id, room_id, sender_id, message, attachment_type,
      attachment_reference, attachment_filename, client_message_id, created_at
    ) VALUES (
      ${messageId}, ${roomId}, ${user.id}, ${message}, ${attachment_type || null},
      ${attachment_reference || null}, ${attachment_filename || null}, ${clientMessageId}, NOW()
    )
  `;

  // STEP 2: Update sender's read cursor in Neon
  const readId = crypto.randomUUID();
  await sql`
    INSERT INTO chat_reads (id, user_id, room_id, last_read_message_id, last_read_at)
    VALUES (${readId}, ${user.id}, ${roomId}, ${messageId}, NOW())
    ON CONFLICT (user_id, room_id)
    DO UPDATE SET last_read_message_id = ${messageId}, last_read_at = NOW()
  `;

  const formattedMessage = {
    id: messageId,
    room_id: roomId,
    sender: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
    message,
    attachment_type: attachment_type || null,
    attachment_reference: attachment_reference || null,
    attachment_filename: attachment_filename || null,
    client_id: clientMessageId,
    status: "sent",
    created_at: new Date().toISOString(),
    edited_at: null,
    is_deleted: false,
  };

  // STEP 3: Broadcast from Durable Object (if configured)
  let onlineUserIds: string[] = [];
  if (c.env.CHAT_ROOMS) {
    try {
      const doId = c.env.CHAT_ROOMS.idFromName(roomId);
      const stub = c.env.CHAT_ROOMS.get(doId);
      const doRes = await stub.fetch("http://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "new_message", message: formattedMessage }),
      });
      if (doRes.ok) {
        const doJson = (await doRes.json().catch(() => ({}))) as {
          online_user_ids?: string[];
        };
        onlineUserIds = doJson.online_user_ids || [];
      }
    } catch (err) {
      console.warn("DO broadcast warning:", err);
    }
  }

  // STEP 4: Offline Push Notification check
  // Avoid duplicate notifications: Only dispatch push if recipients are offline
  const room = await sql`SELECT client_id FROM chat_rooms WHERE id = ${roomId} LIMIT 1`;
  if (room.length > 0) {
    const clientId = room[0].client_id;
    const participants = await sql`
      SELECT u.id FROM users u
      WHERE ((u.client_id = ${clientId} AND u.role = 'client')
         OR u.id IN (SELECT employee_id FROM employee_clients WHERE client_id = ${clientId} AND active = true))
        AND u.id != ${user.id}
    `;

    const offlineRecipients = participants.filter(
      (p: any) => !onlineUserIds.includes(String(p.id))
    );

    // If offline recipients exist, record notification in Neon notifications table
    for (const rec of offlineRecipients) {
      const notifId = crypto.randomUUID();
      await sql`
        INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
        VALUES (${notifId}, ${rec.id}, ${'New message from ' + user.name}, ${message}, 'chat', false, NOW())
      `;
    }
  }

  return c.json(formattedMessage);
});

// 9. POST /api/chat/rooms/:room_id/share-resume
chatRouter.post("/rooms/:room_id/share-resume", requireAuth, async (c) => {
  const roomId = c.req.param("room_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = ShareResumeRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: "Invalid resume ID" }, 400);
  }

  const resumeId = parseResult.data.resume_id;
  const sql = getDb(c.env.DATABASE_URL);

  const resumeRows = await sql`
    SELECT id, candidate_name, company, role, original_filename
    FROM resumes
    WHERE id = ${resumeId}
    LIMIT 1
  `;

  if (resumeRows.length === 0) {
    return c.json({ detail: "Resume not found" }, 404);
  }

  const res = resumeRows[0];
  const messageText = `Shared resume: ${res.candidate_name} (${res.role} - ${res.company})`;

  const messageId = crypto.randomUUID();
  await sql`
    INSERT INTO chat_messages (
      id, room_id, sender_id, message, attachment_type,
      attachment_reference, attachment_filename, created_at
    ) VALUES (
      ${messageId}, ${roomId}, ${user.id}, ${messageText}, 'resume',
      ${resumeId}, ${res.original_filename}, NOW()
    )
  `;

  const formattedMessage = {
    id: messageId,
    room_id: roomId,
    sender: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
    message: messageText,
    attachment_type: "resume",
    attachment_reference: resumeId,
    attachment_filename: res.original_filename,
    status: "sent",
    created_at: new Date().toISOString(),
    edited_at: null,
    is_deleted: false,
  };

  if (c.env.CHAT_ROOMS) {
    try {
      const doId = c.env.CHAT_ROOMS.idFromName(roomId);
      const stub = c.env.CHAT_ROOMS.get(doId);
      await stub.fetch("http://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "new_message", message: formattedMessage }),
      });
    } catch (err) {
      console.warn("DO broadcast warning:", err);
    }
  }

  return c.json(formattedMessage);
});

// 10. POST /api/chat/rooms/:room_id/mark-read (and PATCH/POST /read)
const handleMarkRead = async (c: any) => {
  const roomId = c.req.param("room_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const parseResult = MarkReadRequestSchema.safeParse(body);
  const messageId = parseResult.data?.message_id || null;

  const sql = getDb(c.env.DATABASE_URL);
  const readId = crypto.randomUUID();

  await sql`
    INSERT INTO chat_reads (id, user_id, room_id, last_read_message_id, last_read_at)
    VALUES (${readId}, ${user.id}, ${roomId}, ${messageId}, NOW())
    ON CONFLICT (user_id, room_id)
    DO UPDATE SET last_read_message_id = COALESCE(${messageId}, chat_reads.last_read_message_id), last_read_at = NOW()
  `;

  if (c.env.CHAT_ROOMS) {
    try {
      const doId = c.env.CHAT_ROOMS.idFromName(roomId);
      const stub = c.env.CHAT_ROOMS.get(doId);
      await stub.fetch("http://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "read_receipt",
          user_id: user.id,
          user_name: user.name,
          message_id: messageId,
        }),
      });
    } catch {}
  }

  return c.json({ success: true, message: "Marked as read", unread_count: 0 });
};

chatRouter.post("/rooms/:room_id/mark-read", requireAuth, handleMarkRead);
chatRouter.post("/rooms/:room_id/read", requireAuth, handleMarkRead);
chatRouter.patch("/rooms/:room_id/read", requireAuth, handleMarkRead);

// 11. DELETE /api/chat/messages/:message_id
chatRouter.delete("/messages/:message_id", requireAuth, async (c) => {
  const messageId = c.req.param("message_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const existing = await sql`
    SELECT id, room_id, sender_id FROM chat_messages WHERE id = ${messageId} LIMIT 1
  `;

  if (existing.length === 0) {
    return c.json({ detail: "Message not found" }, 404);
  }

  const msg = existing[0];
  if (user.role !== "admin" && user.role !== "sub_admin" && msg.sender_id !== user.id) {
    return c.json({ detail: "Forbidden: You can only delete your own messages" }, 403);
  }

  await sql`DELETE FROM chat_messages WHERE id = ${messageId}`;

  if (c.env.CHAT_ROOMS) {
    try {
      const doId = c.env.CHAT_ROOMS.idFromName(msg.room_id);
      const stub = c.env.CHAT_ROOMS.get(doId);
      await stub.fetch("http://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "message_deleted", message_id: messageId }),
      });
    } catch {}
  }

  return c.json({ success: true, message_id: messageId });
});

// 12. WebSocket Upgrade Handler: Pure JWT HTTP-Only Cookie Authentication
// Flow: Browser -> GET /api/chat/rooms/:room_id/ws -> Worker verifies JWT cookie -> Durable Object
export async function handleChatWebSocketUpgrade(c: any) {
  const roomId = c.req.param("room_id");

  // Authenticate directly via HTTP-only JWT cookie
  let token = getCookie(c, "access_token");

  // Optional fallback for external or non-browser clients
  if (!token) {
    const authHeader = c.req.header("Authorization") || c.req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (c.req.query("token")) {
      token = c.req.query("token");
    }
  }

  if (!token) {
    return c.text("Unauthorized: No session cookie provided", 401);
  }

  const payload = await verifyToken(token, c.env.JWT_SECRET_KEY);
  if (!payload || !payload.sub) {
    return c.text("Unauthorized: Invalid or expired session", 401);
  }

  if (!c.env.CHAT_ROOMS) {
    return c.text("Durable Objects not configured on Worker", 503);
  }

  const doId = c.env.CHAT_ROOMS.idFromName(roomId);
  const stub = c.env.CHAT_ROOMS.get(doId);

  // Forward upgrade request to Durable Object with verified identity headers
  const forwardHeaders = new Headers(c.req.raw.headers);
  forwardHeaders.set("X-User-Id", String(payload.sub));
  forwardHeaders.set("X-User-Name", String(payload.name || "User"));
  forwardHeaders.set("X-User-Role", String(payload.role || "user"));
  forwardHeaders.set("X-Room-Id", roomId);

  return stub.fetch(
    new Request(c.req.url, {
      method: c.req.method,
      headers: forwardHeaders,
    })
  );
}

chatRouter.get("/rooms/:room_id/ws", handleChatWebSocketUpgrade);
