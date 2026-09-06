import { Hono } from "hono";
import { getDb } from "../db";
import type { Bindings, Variables } from "../types";

export const healthRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

healthRouter.get("/", async (c) => {
  let dbOk = false;
  let dbLatency = 0;

  try {
    const start = Date.now();
    const sql = getDb(c.env.DATABASE_URL);
    await sql`SELECT 1`;
    dbLatency = Date.now() - start;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return c.json({
    status: dbOk ? "healthy" : "degraded",
    runtime: "cloudflare-workers",
    version: "3.0.0-serverless",
    database: {
      connected: dbOk,
      latency_ms: dbLatency,
      provider: "neon-serverless",
    },
    timestamp: new Date().toISOString(),
  });
});
