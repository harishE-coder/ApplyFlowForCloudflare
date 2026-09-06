/**
 * ApplyFlow — Cloudflare Workers Main Backend Entry Point (Hono Framework).
 * Replaces FastAPI with ultra-fast serverless edge workers.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { requestId } from "hono/request-id";
import { aiRouter } from "./routes/ai";
import { applicationsRouter } from "./routes/applications";
import { attendanceRouter } from "./routes/attendance";
import { authRouter } from "./routes/auth";
import { chatRouter, handleChatWebSocketUpgrade } from "./routes/chat";
import { clientsRouter } from "./routes/clients";
import { dashboardRouter } from "./routes/dashboard";
import { employeesRouter } from "./routes/employees";
import { healthRouter } from "./routes/health";
import { notificationsRouter } from "./routes/notifications";
import { requirementsRouter } from "./routes/requirements";
import { resumesRouter } from "./routes/resumes";
import { targetsRouter } from "./routes/targets";
export { ChatRoomDO } from "./durable_objects/ChatRoomDO";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Global Middleware
app.use("*", requestId());
app.use("*", logger());
app.use("*", prettyJSON());

// CORS Configuration with Credentials & Origin Matching
app.use("*", async (c, next) => {
  const origin = c.req.header("Origin") || "";
  const allowed = (c.env.APP_CORS_ORIGINS || "https://applyflowforcloudflare.pages.dev,http://localhost:5173")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""));

  const corsMiddleware = cors({
    origin: (reqOrigin) => {
      if (!reqOrigin || typeof reqOrigin !== "string") return allowed[0];
      const cleanReq = reqOrigin.trim().replace(/\/+$/, "");
      if (
        (Array.isArray(allowed) && allowed.includes(cleanReq)) ||
        cleanReq.includes("localhost") ||
        cleanReq.endsWith(".pages.dev")
      ) {
        return reqOrigin;
      }
      return allowed[0];
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    exposeHeaders: ["Content-Length", "Set-Cookie", "X-Request-Id"],
    maxAge: 86400,
  });

  return corsMiddleware(c, next);
});

// Root welcome & status
app.get("/", (c) => {
  return c.json({
    app: "ApplyFlow Serverless Backend",
    runtime: "Cloudflare Workers",
    version: "3.0.0",
    status: "online",
    documentation: "/api/health",
  });
});

// Mount Module Subrouters
app.route("/api/health", healthRouter);
app.route("/api/auth", authRouter);
app.route("/api/dashboard", dashboardRouter);
app.route("/api/clients", clientsRouter);
app.route("/api/requirements", requirementsRouter);
app.route("/api/applications", applicationsRouter);
app.route("/api/resumes", resumesRouter);
app.route("/api/notifications", notificationsRouter);
app.route("/api/attendance", attendanceRouter);
app.route("/api/targets", targetsRouter);
app.route("/api/chat", chatRouter);
app.route("/api/ai", aiRouter);
app.get("/ws/chat/:room_id", handleChatWebSocketUpgrade);
app.route("/api", employeesRouter);

// Global 404 Handler
app.notFound((c) => {
  return c.json(
    {
      detail: `Route ${c.req.method} ${c.req.path} not found on ApplyFlow Workers.`,
      status: 404,
      request_id: c.get("requestId"),
    },
    404
  );
});

// Global Error Handler
app.onError((err, c) => {
  const reqId = c.get("requestId") || "unknown";
  console.error(`[ApplyFlow Workers Error] [req_id: ${reqId}] ${err.message}`, err.stack);
  return c.json(
    {
      detail: err.message || "Internal server error occurred on Worker.",
      status: 500,
      request_id: reqId,
    },
    500
  );
});

// Cloudflare Workers Scheduled Cron Trigger Handler
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log(`[Workers Cron] Triggered scheduled event at ${new Date(event.scheduledTime).toISOString()}`);
    // Daily resume retention cleanup: purge resumes older than RESUME_RETENTION_DAYS (default 120 days)
    ctx.waitUntil(
      (async () => {
        try {
          const retentionDays = Number(env.RESUME_RETENTION_DAYS || 120);
          const { getDb } = await import("./db");
          const { deleteResume } = await import("./services/googleAppsScript");
          const sql = getDb(env.DATABASE_URL);

          const expired = await sql`
            SELECT id, drive_file_id, r2_key FROM resumes
            WHERE upload_date < NOW() - (${retentionDays} || ' days')::interval
          `;

          for (const row of expired) {
            const fileId = row.drive_file_id || row.r2_key;
            if (fileId) {
              await deleteResume(fileId, env);
            }
          }

          if (expired.length > 0) {
            const ids = expired.map((r: any) => r.id);
            await sql`DELETE FROM resumes WHERE id = ANY(${ids})`;
            console.log(`[Workers Cron] Cleaned ${expired.length} expired resumes from Google Drive and database.`);
          }
        } catch (err) {
          console.error(`[Workers Cron] Failed resume cleanup job:`, err);
        }
      })()
    );
  },
};
