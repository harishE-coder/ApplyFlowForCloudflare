import { Hono } from "hono";
import { getDb } from "../db";
import { requireAuth } from "../middleware/auth";
import type { Bindings, Variables } from "../types";

export const notificationsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

notificationsRouter.use("*", requireAuth);

// 1. GET /api/notifications
notificationsRouter.get("/", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const [items, unreadRes] = await Promise.all([
    sql`
      SELECT id, user_id, title, message, type, is_read, created_at
      FROM notifications
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 50
    `,
    sql`
      SELECT COUNT(*)::int as count
      FROM notifications
      WHERE user_id = ${user.id} AND is_read = false
    `,
  ]);

  return c.json({
    unread_count: unreadRes[0]?.count || 0,
    items: items.map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      title: r.title,
      message: r.message,
      type: r.type || "info",
      is_read: Boolean(r.is_read),
      created_at: r.created_at,
    })),
  });
});

// 2. PUT & POST /api/notifications/:id/read
const markReadHandler = async (c: any) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  await sql`
    UPDATE notifications
    SET is_read = true
    WHERE id = ${id} AND user_id = ${user.id}
  `;

  return c.json({ message: "Marked as read" });
};

notificationsRouter.put("/:id/read", markReadHandler);
notificationsRouter.post("/:id/read", markReadHandler);

// 3. POST /api/notifications/read-all
notificationsRouter.post("/read-all", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const updated = await sql`
    UPDATE notifications
    SET is_read = true
    WHERE user_id = ${user.id} AND is_read = false
    RETURNING id
  `;

  return c.json({ message: `${updated.length} notifications marked as read` });
});

// 4. DELETE /api/notifications/:id
notificationsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  await sql`
    DELETE FROM notifications
    WHERE id = ${id} AND user_id = ${user.id}
  `;

  return c.json({ message: "Notification deleted successfully" });
});

// 5. DELETE /api/notifications/clear-old
notificationsRouter.delete("/clear-old", async (c) => {
  const days = Math.max(1, Number(c.req.query("days") || 30));
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const deleted = await sql`
    DELETE FROM notifications
    WHERE user_id = ${user.id}
      AND is_read = true
      AND created_at < NOW() - (${days} || ' days')::interval
    RETURNING id
  `;

  return c.json({ message: `${deleted.length} old notifications cleared` });
});
