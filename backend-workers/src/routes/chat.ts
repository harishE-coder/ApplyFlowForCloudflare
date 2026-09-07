import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { getJwtSecret, verifyToken } from "../auth";
import { getDb } from "../db";
import { requireAuth } from "../middleware/auth";
import {
  MarkReadRequestSchema,
  NotificationPreferencesUpdateSchema,
  PushSubscriptionCreateSchema,
  PushUnsubscribeRequestSchema,
  SendMessageRequestSchema,
  ShareJobRequestSchema,
  ShareResumeRequestSchema,
} from "../schemas/chat";
import {
  getDownloadUrl,
  getPreviewUrl,
  uploadResume,
} from "../services/googleAppsScript";
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
  } else if (user.role === "sub_admin") {
    const assignedClients = await sql`
      SELECT client_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true AND client_id IS NOT NULL
      UNION
      SELECT id as client_id FROM clients WHERE managed_by = ${user.id}
    `;
    allowedClientIds = assignedClients.map((r: any) => String(r.client_id));
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
      SELECT
        r.id,
        r.client_id,
        c.company_name as client_name,
        r.status,
        r.created_at,
        MAX(m.created_at) as last_message_at
      FROM chat_rooms r
      JOIN clients c ON c.id = r.client_id
      LEFT JOIN chat_messages m ON m.room_id = r.id
      WHERE r.client_id = ANY(${allowedClientIds})
      GROUP BY r.id, r.client_id, c.company_name, r.status, r.created_at
      ORDER BY COALESCE(MAX(m.created_at), r.created_at) DESC
    `;
  } else {
    rooms = await sql`
      SELECT
        r.id,
        r.client_id,
        c.company_name as client_name,
        r.status,
        r.created_at,
        MAX(m.created_at) as last_message_at
      FROM chat_rooms r
      JOIN clients c ON c.id = r.client_id
      LEFT JOIN chat_messages m ON m.room_id = r.id
      GROUP BY r.id, r.client_id, c.company_name, r.status, r.created_at
      ORDER BY COALESCE(MAX(m.created_at), r.created_at) DESC
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

    const lastMsgTime = latestMsg[0]?.created_at || r.last_message_at || null;

    items.push({
      id: r.id,
      client_id: r.client_id,
      client_name: r.client_name,
      status: r.status,
      created_at: r.created_at,
      participants: participants.map((p: any) => ({
        id: p.id,
        name: p.name,
        role: p.role,
      })),
      last_message: latestMsg[0]?.message || null,
      last_message_sender: latestMsg[0]?.sender_name || null,
      last_message_at: lastMsgTime,
      unread_count: unread,
    });
  }

  // Sort items descending by latest activity timestamp (last_message_at or created_at)
  items.sort((a, b) => {
    const timeA = new Date(a.last_message_at || a.created_at || 0).getTime();
    const timeB = new Date(b.last_message_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });

  return c.json({ items, total_unread: totalUnread });
});

// 7. GET /api/chat/rooms/:room_id/messages (fast index on room_id, created_at DESC)
chatRouter.get("/rooms/:room_id/messages", requireAuth, async (c) => {
  const roomId = c.req.param("room_id");
  const user = c.get("user");
  const isAdmin = user.role === "admin" || user.role === "super_admin";
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
          m.attachment_reference,
          m.created_at, m.edited_at,
          COALESCE(m.is_deleted, false) as is_deleted,
          m.deleted_by, m.deleted_at,
          u.name as sender_name, u.role as sender_role,
          ud.name as deleted_by_name, ud.role as deleted_by_role
        FROM chat_messages m
        LEFT JOIN users u ON u.id = m.sender_id
        LEFT JOIN users ud ON ud.id = m.deleted_by
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
        m.attachment_reference,
        m.created_at, m.edited_at,
        COALESCE(m.is_deleted, false) as is_deleted,
        m.deleted_by, m.deleted_at,
        u.name as sender_name, u.role as sender_role,
        ud.name as deleted_by_name, ud.role as deleted_by_role
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      LEFT JOIN users ud ON ud.id = m.deleted_by
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

  const items = messages.map((m: any) => {
    const isDeleted = Boolean(
      m.is_deleted ||
      m.message === "[Message deleted]" ||
      m.message === "This message was deleted."
    );

    // For non-Admins (Sub-Admin, Client, Employee), completely sanitize deleted messages
    if (isDeleted && !isAdmin) {
      return {
        id: m.id,
        room_id: m.room_id,
        sender: {
          id: m.sender_id,
          name: m.sender_name || "Deleted User",
          role: m.sender_role || "user",
        },
        message: "This message was deleted.",
        attachment_type: null,
        attachment_reference: null,
        attachment_name: null,
        attachment_filename: null,
        attachment_url: null,
        attachment_download_url: null,
        attachment_thumbnail_url: null,
        resume_data: null,
        job_data: null,
        client_id: null,
        status: "delivered",
        created_at: m.created_at,
        edited_at: m.edited_at,
        is_deleted: true,
        deleted_by: null,
        deleted_by_name: null,
        deleted_by_role: null,
        deleted_at: m.deleted_at || null,
      };
    }

    let parsedRef: any = null;
    if (
      m.attachment_reference &&
      typeof m.attachment_reference === "string" &&
      m.attachment_reference.trim().startsWith("{")
    ) {
      try {
        parsedRef = JSON.parse(m.attachment_reference);
      } catch {}
    }

    let attachmentRef = m.attachment_reference || null;
    let attachmentName: string | null = null;
    let attachmentFilename: string | null = null;
    let attachmentUrl: string | null = null;
    let attachmentDownloadUrl: string | null = null;
    let attachmentThumbnailUrl: string | null = null;
    let resumeData: any = null;
    let jobData: any = null;

    if (m.attachment_type === "resume") {
      if (parsedRef) {
        attachmentRef = parsedRef.resumeId || m.attachment_reference;
        attachmentName = parsedRef.filename || parsedRef.candidate_name || null;
        attachmentFilename = parsedRef.filename || null;
        attachmentUrl = parsedRef.drive_view_url || null;
        attachmentDownloadUrl = parsedRef.drive_download_url || null;
        resumeData = parsedRef;
      }
    } else if (m.attachment_type === "job") {
      if (parsedRef) {
        attachmentRef = parsedRef.id || m.attachment_reference;
        attachmentName = parsedRef.title || null;
        attachmentUrl = parsedRef.job_url || null;
        jobData = parsedRef;
      }
    } else if (
      m.attachment_type === "image" ||
      m.attachment_type === "pdf" ||
      m.attachment_type === "file"
    ) {
      if (parsedRef) {
        attachmentRef = parsedRef.fileId || m.attachment_reference;
        attachmentName = parsedRef.filename || null;
        attachmentFilename = parsedRef.filename || null;
        attachmentUrl =
          parsedRef.viewUrl ||
          (parsedRef.fileId ? getPreviewUrl(parsedRef.fileId) : null);
        attachmentDownloadUrl =
          parsedRef.downloadUrl ||
          (parsedRef.fileId ? getDownloadUrl(parsedRef.fileId) : null);
        attachmentThumbnailUrl =
          parsedRef.thumbnailUrl ||
          (m.attachment_type === "image" && parsedRef.fileId
            ? `https://drive.google.com/thumbnail?id=${parsedRef.fileId}&sz=w800`
            : null);
      } else if (m.attachment_reference) {
        attachmentName = m.attachment_reference;
        attachmentFilename = m.attachment_reference;
        if (m.attachment_type === "image") {
          attachmentUrl = getPreviewUrl(m.attachment_reference);
          attachmentDownloadUrl = getDownloadUrl(m.attachment_reference);
          attachmentThumbnailUrl = `https://drive.google.com/thumbnail?id=${m.attachment_reference}&sz=w800`;
        } else if (m.attachment_type === "pdf" || m.attachment_type === "file") {
          attachmentUrl = getPreviewUrl(m.attachment_reference);
          attachmentDownloadUrl = getDownloadUrl(m.attachment_reference);
        }
      }
    }

    return {
      id: m.id,
      room_id: m.room_id,
      sender: {
        id: m.sender_id,
        name: m.sender_name || "Deleted User",
        role: m.sender_role || "user",
      },
      message: m.message,
      attachment_type: m.attachment_type || null,
      attachment_reference: attachmentRef,
      attachment_name: attachmentName,
      attachment_filename: attachmentFilename,
      attachment_url: attachmentUrl,
      attachment_download_url: attachmentDownloadUrl,
      attachment_thumbnail_url: attachmentThumbnailUrl,
      resume_data: resumeData,
      job_data: jobData,
      client_id: null,
      status: "delivered",
      created_at: m.created_at,
      edited_at: m.edited_at,
      is_deleted: isDeleted,
      deleted_by: m.deleted_by || null,
      deleted_by_name: m.deleted_by_name || (isDeleted ? "Admin" : null),
      deleted_by_role: m.deleted_by_role || (isDeleted ? "admin" : null),
      deleted_at: m.deleted_at || null,
    };
  });

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

  // STEP 1: Insert into Neon PostgreSQL (Source of Truth)
  const messageId = crypto.randomUUID();
  await sql`
    INSERT INTO chat_messages (
      id, room_id, sender_id, message, attachment_type,
      attachment_reference, created_at
    ) VALUES (
      ${messageId}, ${roomId}, ${user.id}, ${message}, ${attachment_type || null},
      ${attachment_reference || null}, NOW()
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

  const { resume_id: resumeId, caption } = parseResult.data;
  const sql = getDb(c.env.DATABASE_URL);

  const resumeRows = await sql`
    SELECT id, candidate_name, company, role, original_filename, drive_file_id, drive_view_url, drive_download_url
    FROM resumes
    WHERE id = ${resumeId}
    LIMIT 1
  `;

  if (resumeRows.length === 0) {
    return c.json({ detail: "Resume not found" }, 404);
  }

  const res = resumeRows[0];
  const messageText =
    caption && caption.trim().length > 0
      ? caption.trim()
      : `Shared resume: ${res.candidate_name || "Candidate"} (${res.role || "Role"} - ${res.company || "Company"})`;

  const resumeData = {
    resumeId: res.id,
    candidate_name: res.candidate_name,
    role: res.role,
    company: res.company,
    filename: res.original_filename,
    drive_file_id: res.drive_file_id,
    drive_view_url: res.drive_view_url,
    drive_download_url: res.drive_download_url,
  };

  const messageId = crypto.randomUUID();
  await sql`
    INSERT INTO chat_messages (
      id, room_id, sender_id, message, attachment_type,
      attachment_reference, created_at
    ) VALUES (
      ${messageId}, ${roomId}, ${user.id}, ${messageText}, 'resume',
      ${JSON.stringify(resumeData)}, NOW()
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
    attachment_name: res.original_filename || res.candidate_name,
    attachment_filename: res.original_filename,
    attachment_url: res.drive_view_url,
    attachment_download_url: res.drive_download_url,
    resume_data: resumeData,
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

// 9b. POST /api/chat/rooms/:room_id/attachment
chatRouter.post("/rooms/:room_id/attachment", requireAuth, async (c) => {
  const roomId = c.req.param("room_id");
  const user = c.get("user");
  const formData = await c.req.formData().catch(() => null);

  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return c.json({ detail: "No file provided in 'file' form field." }, 400);
  }

  const mime = (file.type || "").toLowerCase();
  const lowerName = (file.name || "").toLowerCase();
  let attachmentType = "file";
  if (mime.startsWith("image/") || lowerName.match(/\.(png|jpe?g|gif|webp|svg|bmp)$/)) {
    attachmentType = "image";
  } else if (mime === "application/pdf" || lowerName.endsWith(".pdf") || lowerName.match(/\.(docx?|txt|rtf)$/)) {
    attachmentType = "pdf";
  }

  let fileId = "";
  let viewUrl = "";
  let downloadUrl = "";
  let thumbnailUrl = "";

  if (c.env.GOOGLE_APPS_SCRIPT_URL) {
    try {
      const uploadRes = await uploadResume(
        await file.arrayBuffer(),
        file.name,
        "Chat Attachment",
        c.env,
        file.type
      );
      fileId = uploadRes.fileId;
      viewUrl = uploadRes.viewUrl;
      downloadUrl = uploadRes.downloadUrl;
      thumbnailUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w800`;
    } catch (err) {
      console.warn("Google Apps Script upload warning:", err);
      fileId = `chat_${crypto.randomUUID()}`;
      viewUrl = getPreviewUrl(fileId);
      downloadUrl = getDownloadUrl(fileId);
      thumbnailUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w800`;
    }
  } else {
    fileId = `chat_${crypto.randomUUID()}`;
    viewUrl = getPreviewUrl(fileId);
    downloadUrl = getDownloadUrl(fileId);
    thumbnailUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w800`;
  }

  const cachedMetadata = {
    fileId,
    viewUrl,
    downloadUrl,
    thumbnailUrl,
    filename: file.name,
    mimeType: file.type,
    size: file.size,
  };

  const sql = getDb(c.env.DATABASE_URL);
  const messageText = file.name;
  const messageId = crypto.randomUUID();

  await sql`
    INSERT INTO chat_messages (
      id, room_id, sender_id, message, attachment_type,
      attachment_reference, created_at
    ) VALUES (
      ${messageId}, ${roomId}, ${user.id}, ${messageText}, ${attachmentType},
      ${JSON.stringify(cachedMetadata)}, NOW()
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
    attachment_type: attachmentType,
    attachment_reference: fileId,
    attachment_name: file.name,
    attachment_filename: file.name,
    attachment_url: viewUrl,
    attachment_download_url: downloadUrl,
    attachment_thumbnail_url: thumbnailUrl,
    client_id: null,
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
    } catch {}
  }

  return c.json(formattedMessage);
});

// 9c. POST /api/chat/rooms/:room_id/share-job
chatRouter.post("/rooms/:room_id/share-job", requireAuth, async (c) => {
  const roomId = c.req.param("room_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = ShareJobRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: "Invalid requirement ID" }, 400);
  }

  const { requirement_id: reqId, caption } = parseResult.data;
  const sql = getDb(c.env.DATABASE_URL);

  const reqRows = await sql`
    SELECT r.id, r.job_title, r.role, r.role_code, r.company, r.priority, r.status, r.job_url, r.notes,
           c.company_name as client_company_name
    FROM requirements r
    LEFT JOIN clients c ON c.id = r.client_id
    WHERE r.id = ${reqId}
    LIMIT 1
  `;

  if (reqRows.length === 0) {
    return c.json({ detail: "Job requirement not found" }, 404);
  }

  const req = reqRows[0];
  const companyName = req.company || req.client_company_name || "Client Company";
  const jobTitle = req.job_title || req.role || "Open Role";

  const messageText =
    caption && caption.trim().length > 0
      ? caption.trim()
      : `Shared job opening: ${jobTitle} (${companyName})`;

  const jobData = {
    id: req.id,
    title: jobTitle,
    role: req.role || jobTitle,
    role_code: req.role_code || null,
    company: companyName,
    priority: req.priority || "Medium",
    location: "Remote",
    openings: 1,
    status: req.status || "active",
    job_url: req.job_url || null,
    notes: req.notes || null,
  };

  const messageId = crypto.randomUUID();
  await sql`
    INSERT INTO chat_messages (
      id, room_id, sender_id, message, attachment_type,
      attachment_reference, created_at
    ) VALUES (
      ${messageId}, ${roomId}, ${user.id}, ${messageText}, 'job',
      ${JSON.stringify(jobData)}, NOW()
    )
  `;

  // Update sender's read cursor in Neon
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
    message: messageText,
    attachment_type: "job",
    attachment_reference: req.id,
    attachment_name: jobTitle,
    attachment_url: req.job_url || null,
    job_data: jobData,
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
    SELECT m.id, m.room_id, m.sender_id, u.role as sender_role
    FROM chat_messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.id = ${messageId}
    LIMIT 1
  `;

  if (existing.length === 0) {
    return c.json({ detail: "Message not found" }, 404);
  }

  const msg = existing[0];
  const isOwn = msg.sender_id === user.id;
  const callerRole = user.role;
  const senderRole = msg.sender_role || "user";

  let allowed = false;
  if (callerRole === "admin" || callerRole === "super_admin") {
    allowed = true;
  } else if (callerRole === "sub_admin") {
    // Sub-Admin can delete own, client, or employee messages, but NOT admin/super_admin messages
    if (senderRole === "admin" || senderRole === "super_admin") {
      allowed = isOwn;
    } else {
      allowed = true;
    }
  } else {
    // Client & Employee: own only
    allowed = isOwn;
  }

  if (!allowed) {
    return c.json(
      { detail: "Forbidden: You do not have permission to delete this message" },
      403
    );
  }

  const deletedAt = new Date().toISOString();

  // Soft delete with audit preservation: keep original message and attachments intact for Admin audit
  await sql`
    UPDATE chat_messages
    SET
      is_deleted = true,
      deleted_at = NOW(),
      deleted_by = ${user.id}
    WHERE id = ${messageId}
  `;

  if (c.env.CHAT_ROOMS) {
    try {
      const doId = c.env.CHAT_ROOMS.idFromName(msg.room_id);
      const stub = c.env.CHAT_ROOMS.get(doId);
      await stub.fetch("http://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "message_deleted",
          message_id: messageId,
          room_id: msg.room_id,
          deleted_by: user.id,
          deleted_by_name: user.name,
          deleted_by_role: user.role,
          deleted_at: deletedAt,
        }),
      });
    } catch {}
  }

  return c.json({
    success: true,
    message_id: messageId,
    deleted_by: user.id,
    deleted_by_name: user.name,
    deleted_by_role: user.role,
    deleted_at: deletedAt,
  });
});

// 12. POST /api/chat/rooms/:room_id/lock
chatRouter.post("/rooms/:room_id/lock", requireAuth, async (c) => {
  const roomId = c.req.param("room_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  if (user.role !== "admin" && user.role !== "sub_admin") {
    return c.json({ detail: "Only Admins and Sub-Admins can lock rooms" }, 403);
  }

  const existing = await sql`
    SELECT id, client_id, status FROM chat_rooms WHERE id = ${roomId} LIMIT 1
  `;
  if (existing.length === 0) {
    return c.json({ detail: "Chat room not found" }, 404);
  }

  const room = existing[0];
  if (user.role === "sub_admin") {
    const assignedClients = await sql`
      SELECT client_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true AND client_id IS NOT NULL
      UNION
      SELECT id as client_id FROM clients WHERE managed_by = ${user.id}
    `;
    const allowed = assignedClients.map((r: any) => String(r.client_id));
    if (!allowed.includes(String(room.client_id))) {
      return c.json({ detail: "Forbidden: You do not have access to this client chat room" }, 403);
    }
  }

  await sql`UPDATE chat_rooms SET status = 'read_only' WHERE id = ${roomId}`;

  if (c.env.CHAT_ROOMS) {
    try {
      const doId = c.env.CHAT_ROOMS.idFromName(roomId);
      const stub = c.env.CHAT_ROOMS.get(doId);
      await stub.fetch("http://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "room_status_changed",
          room_id: roomId,
          status: "read_only",
        }),
      });
    } catch {}
  }

  return c.json({ success: true, status: "read_only" });
});

// 13. POST /api/chat/rooms/:room_id/unlock
chatRouter.post("/rooms/:room_id/unlock", requireAuth, async (c) => {
  const roomId = c.req.param("room_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  if (user.role !== "admin" && user.role !== "sub_admin") {
    return c.json({ detail: "Only Admins and Sub-Admins can unlock rooms" }, 403);
  }

  const existing = await sql`
    SELECT id, client_id, status FROM chat_rooms WHERE id = ${roomId} LIMIT 1
  `;
  if (existing.length === 0) {
    return c.json({ detail: "Chat room not found" }, 404);
  }

  const room = existing[0];
  if (user.role === "sub_admin") {
    const assignedClients = await sql`
      SELECT client_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true AND client_id IS NOT NULL
      UNION
      SELECT id as client_id FROM clients WHERE managed_by = ${user.id}
    `;
    const allowed = assignedClients.map((r: any) => String(r.client_id));
    if (!allowed.includes(String(room.client_id))) {
      return c.json({ detail: "Forbidden: You do not have access to this client chat room" }, 403);
    }
  }

  await sql`UPDATE chat_rooms SET status = 'active' WHERE id = ${roomId}`;

  if (c.env.CHAT_ROOMS) {
    try {
      const doId = c.env.CHAT_ROOMS.idFromName(roomId);
      const stub = c.env.CHAT_ROOMS.get(doId);
      await stub.fetch("http://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "room_status_changed",
          room_id: roomId,
          status: "active",
        }),
      });
    } catch {}
  }

  return c.json({ success: true, status: "active" });
});

// 14. POST /api/chat/rooms/:room_id/archive
chatRouter.post("/rooms/:room_id/archive", requireAuth, async (c) => {
  const roomId = c.req.param("room_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  if (user.role !== "admin" && user.role !== "sub_admin") {
    return c.json({ detail: "Only Admins and Sub-Admins can archive rooms" }, 403);
  }

  const existing = await sql`
    SELECT id, client_id, status FROM chat_rooms WHERE id = ${roomId} LIMIT 1
  `;
  if (existing.length === 0) {
    return c.json({ detail: "Chat room not found" }, 404);
  }

  const room = existing[0];
  if (user.role === "sub_admin") {
    const assignedClients = await sql`
      SELECT client_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true AND client_id IS NOT NULL
      UNION
      SELECT id as client_id FROM clients WHERE managed_by = ${user.id}
    `;
    const allowed = assignedClients.map((r: any) => String(r.client_id));
    if (!allowed.includes(String(room.client_id))) {
      return c.json({ detail: "Forbidden: You do not have access to this client chat room" }, 403);
    }
  }

  await sql`UPDATE chat_rooms SET status = 'archived' WHERE id = ${roomId}`;

  if (c.env.CHAT_ROOMS) {
    try {
      const doId = c.env.CHAT_ROOMS.idFromName(roomId);
      const stub = c.env.CHAT_ROOMS.get(doId);
      await stub.fetch("http://do/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "room_status_changed",
          room_id: roomId,
          status: "archived",
        }),
      });
    } catch {}
  }

  return c.json({ success: true, status: "archived" });
});

// 15. GET /api/chat/rooms/:room_id/export
chatRouter.get("/rooms/:room_id/export", requireAuth, async (c) => {
  const roomId = c.req.param("room_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const existing = await sql`
    SELECT r.id, r.client_id, r.status, c.company_name
    FROM chat_rooms r
    JOIN clients c ON c.id = r.client_id
    WHERE r.id = ${roomId}
    LIMIT 1
  `;
  if (existing.length === 0) {
    return c.json({ detail: "Chat room not found" }, 404);
  }

  const room = existing[0];
  if (user.role === "client") {
    if (user.client_id && String(user.client_id) !== String(room.client_id)) {
      return c.json({ detail: "Forbidden" }, 403);
    }
  } else if (user.role === "sub_admin") {
    const assignedClients = await sql`
      SELECT client_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true AND client_id IS NOT NULL
      UNION
      SELECT id as client_id FROM clients WHERE managed_by = ${user.id}
    `;
    const allowed = assignedClients.map((r: any) => String(r.client_id));
    if (!allowed.includes(String(room.client_id))) {
      return c.json({ detail: "Forbidden" }, 403);
    }
  } else if (user.role === "employee" || user.role === "recruiter") {
    const assigned = await sql`
      SELECT client_id FROM employee_clients WHERE employee_id = ${user.id} AND active = true
    `;
    const cids = assigned.map((r: any) => String(r.client_id));
    if (cids.length > 0 && !cids.includes(String(room.client_id))) {
      return c.json({ detail: "Forbidden" }, 403);
    }
  }

  const messages = await sql`
    SELECT m.created_at, m.message, u.name as sender_name
    FROM chat_messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.room_id = ${roomId}
    ORDER BY m.created_at ASC
  `;

  const transcript = messages.map(
    (m: any) => `[${new Date(m.created_at).toISOString().replace('T', ' ').substring(0, 19)}] ${m.sender_name || 'Unknown'}: ${m.message}`
  ).join('\n');

  return c.json({
    room_id: roomId,
    client_name: room.company_name || "Client",
    exported_at: new Date().toISOString(),
    transcript,
    messages,
  });
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

  let jwtSecret: string;
  try {
    jwtSecret = getJwtSecret(c.env);
  } catch {
    return c.text("Unauthorized: Server authentication configuration error", 500);
  }

  const payload = await verifyToken(token, jwtSecret);
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
