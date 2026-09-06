/**
 * ApplyFlow — Cloudflare Workers Main Backend Entry Point (Hono Framework).
 * Replaces FastAPI with ultra-fast serverless edge workers.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { authRouter } from "./routes/auth";
import { clientsRouter } from "./routes/clients";
import { dashboardRouter } from "./routes/dashboard";
import { employeesRouter } from "./routes/employees";
import { healthRouter } from "./routes/health";
import { requirementsRouter } from "./routes/requirements";
import type { Bindings, Variables } from "./types";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Global Middleware
app.use("*", logger());
app.use("*", prettyJSON());

// CORS Configuration with Credentials & Origin Matching
app.use("*", async (c, next) => {
  const origin = c.req.header("Origin") || "";
  const allowed = (c.env.APP_CORS_ORIGINS || "http://localhost:5173,https://applyflow.pages.dev")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""));

  const corsMiddleware = cors({
    origin: (reqOrigin) => {
      if (!reqOrigin) return allowed[0];
      const cleanReq = reqOrigin.trim().replace(/\/+$/, "");
      if (allowed.includes(cleanReq) || cleanReq.includes("localhost") || cleanReq.endsWith(".pages.dev")) {
        return reqOrigin;
      }
      return allowed[0];
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    exposeHeaders: ["Content-Length", "Set-Cookie"],
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
app.route("/api", employeesRouter);

// Global 404 Handler
app.notFound((c) => {
  return c.json(
    {
      detail: `Route ${c.req.method} ${c.req.path} not found on ApplyFlow Workers.`,
      status: 404,
    },
    404
  );
});

// Global Error Handler
app.onError((err, c) => {
  console.error(`[ApplyFlow Workers Error] ${err.message}`, err.stack);
  return c.json(
    {
      detail: err.message || "Internal server error occurred on Worker.",
      status: 500,
    },
    500
  );
});

// Cloudflare Workers Scheduled Cron Trigger Handler
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
    console.log(`[Workers Cron] Triggered scheduled event at ${new Date(event.scheduledTime).toISOString()}`);
    // Future Wave 5 jobs: e.g. R2 resume cleanup, expired notification purging
  },
};
