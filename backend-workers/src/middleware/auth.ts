/**
 * Authentication and Role Authorization Middleware for Cloudflare Workers.
 */

import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken } from "../auth";
import { getDb } from "../db";
import type { Bindings, Variables, UserPayload } from "../types";

export const requireAuth: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  let token = getCookie(c, "access_token");

  if (!token) {
    const authHeader = c.req.header("Authorization") || c.req.header("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return c.json({ detail: "Not authenticated" }, 401);
  }

  const payload = await verifyToken(token, c.env.JWT_SECRET_KEY);
  if (!payload || payload.type !== "access" || !payload.sub) {
    return c.json({ detail: "Invalid or expired token" }, 401);
  }

  try {
    const sql = getDb(c.env.DATABASE_URL);
    const users = await sql`
      SELECT id, name, email, role, client_id, is_active
      FROM users
      WHERE id = ${payload.sub} AND is_active = true
      LIMIT 1
    `;

    if (!users || users.length === 0) {
      return c.json({ detail: "User not found or inactive" }, 401);
    }

    const u = users[0];
    const userPayload: UserPayload = {
      id: String(u.id),
      email: String(u.email),
      name: String(u.name || ""),
      role: u.role as UserPayload["role"],
      client_id: u.client_id ? String(u.client_id) : null,
    };

    c.set("user", userPayload);
    await next();
  } catch (err: any) {
    return c.json({ detail: `Database authentication error: ${err.message}` }, 500);
  }
};

export const requireRoles = (
  ...allowedRoles: Array<UserPayload["role"]>
): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> => {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ detail: "Not authenticated" }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json({ detail: "Forbidden: insufficient permissions" }, 403);
    }

    await next();
  };
};
