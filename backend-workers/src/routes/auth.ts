import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import {
  clearAuthCookies,
  createAccessToken,
  createRefreshToken,
  getJwtSecret,
  setAuthCookies,
  verifyPassword,
  verifyToken,
} from "../auth";
import { getDb } from "../db";
import { requireAuth } from "../middleware/auth";
import type { Bindings, UserPayload, Variables } from "../types";

export const authRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 1. POST /api/auth/login
authRouter.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.email || !body.password) {
    return c.json({ detail: "Email and password are required." }, 400);
  }

  const email = String(body.email).trim().toLowerCase();
  const password = String(body.password);

  const sql = getDb(c.env.DATABASE_URL);
  const users = await sql`
    SELECT *
    FROM users
    WHERE LOWER(email) = ${email}
    LIMIT 1
  `;

  if (!users || users.length === 0) {
    return c.json({ detail: "Invalid email or password" }, 401);
  }

  const user = users[0];
  if (!user.is_active) {
    return c.json({ detail: "Account is disabled. Please contact an administrator." }, 403);
  }

  const storedPasswordHash = user.password_hash || user.hashed_password;
  if (!storedPasswordHash) {
    return c.json({ detail: "Invalid email or password" }, 401);
  }

  const passwordValid = await verifyPassword(password, storedPasswordHash);
  if (!passwordValid) {
    return c.json({ detail: "Invalid email or password" }, 401);
  }

  const userPayload: UserPayload = {
    id: String(user.id),
    email: String(user.email),
    name: String(user.name || ""),
    role: user.role as UserPayload["role"],
    client_id: user.client_id ? String(user.client_id) : null,
  };

  const expireMinutes = Number(c.env.ACCESS_TOKEN_EXPIRE_MINUTES) || 60;
  const expireDays = Number(c.env.REFRESH_TOKEN_EXPIRE_DAYS) || 7;

  const jwtSecret = getJwtSecret(c.env);
  const accessToken = await createAccessToken(userPayload, jwtSecret, expireMinutes);
  const refreshToken = await createRefreshToken(userPayload, jwtSecret, expireDays);

  setAuthCookies(c, accessToken, refreshToken, expireMinutes, expireDays);

  return c.json({
    user: {
      id: userPayload.id,
      name: userPayload.name,
      email: userPayload.email,
      role: userPayload.role,
      client_id: userPayload.client_id,
      is_active: true,
      created_at: user.created_at,
    },
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    message: "Login successful",
  });
});

// 2. POST /api/auth/refresh
authRouter.post("/refresh", async (c) => {
  let refreshToken = getCookie(c, "refresh_token");

  if (!refreshToken) {
    const body = await c.req.json().catch(() => null);
    if (body?.refresh_token) {
      refreshToken = body.refresh_token;
    }
  }

  if (!refreshToken) {
    return c.json({ detail: "No refresh token" }, 401);
  }

  const jwtSecret = getJwtSecret(c.env);
  const payload = await verifyToken(refreshToken, jwtSecret);
  if (!payload || payload.type !== "refresh" || !payload.sub) {
    return c.json({ detail: "Invalid or expired refresh token" }, 401);
  }

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

  const expireMinutes = Number(c.env.ACCESS_TOKEN_EXPIRE_MINUTES) || 60;
  const expireDays = Number(c.env.REFRESH_TOKEN_EXPIRE_DAYS) || 7;

  const newAccessToken = await createAccessToken(userPayload, jwtSecret, expireMinutes);
  const newRefreshToken = await createRefreshToken(userPayload, jwtSecret, expireDays);

  setAuthCookies(c, newAccessToken, newRefreshToken, expireMinutes, expireDays);

  return c.json({
    message: "Token refreshed",
    access_token: newAccessToken,
    refresh_token: newRefreshToken,
    token_type: "bearer",
  });
});

// 3. POST /api/auth/logout
authRouter.post("/logout", async (c) => {
  clearAuthCookies(c);
  return c.json({ message: "Logged out" });
});

// 4. GET /api/auth/me
authRouter.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT id, name, email, role, client_id, is_active, created_at
    FROM users
    WHERE id = ${user.id}
    LIMIT 1
  `;

  if (!rows || rows.length === 0) {
    return c.json({ detail: "User not found" }, 404);
  }

  const u = rows[0];
  return c.json({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    client_id: u.client_id,
    is_active: u.is_active,
    created_at: u.created_at,
  });
});

// 5. GET /api/auth/bootstrap
authRouter.get("/bootstrap", requireAuth, async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const [users, clientsRes, appsRes] = await Promise.all([
    sql`
      SELECT id, name, email, role, client_id, is_active, created_at
      FROM users
      WHERE id = ${user.id}
      LIMIT 1
    `,
    sql`SELECT count(*)::int as count FROM clients WHERE is_active = true`,
    sql`SELECT count(*)::int as count FROM applications`,
  ]);

  if (!users || users.length === 0) {
    return c.json({ detail: "User not found" }, 404);
  }

  const u = users[0];
  return c.json({
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      client_id: u.client_id,
      is_active: u.is_active,
      created_at: u.created_at,
    },
    dashboard: {
      metrics: {
        total_clients: clientsRes[0]?.count || 0,
        total_applications: appsRes[0]?.count || 0,
      },
    },
    notifications: [],
    chat_unread: 0,
  });
});

