/**
 * Authentication and JWT utilities for Cloudflare Workers.
 * Pure JS bcrypt & WebCrypto JWT (zero native C++ bindings).
 */

import bcrypt from "bcryptjs";
import { sign, verify } from "hono/jwt";
import type { Context } from "hono";
import type { Bindings, Variables, UserPayload } from "./types";

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plain, salt);
}

export async function createAccessToken(
  user: UserPayload,
  secret: string,
  expireMinutes: number = 60
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expireMinutes * 60;
  return sign(
    {
      sub: user.id,
      role: user.role,
      type: "access",
      exp,
      jti: crypto.randomUUID(),
    },
    secret
  );
}

export async function createRefreshToken(
  user: UserPayload,
  secret: string,
  expireDays: number = 7
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + expireDays * 24 * 60 * 60;
  return sign(
    {
      sub: user.id,
      role: user.role,
      type: "refresh",
      exp,
      jti: crypto.randomUUID(),
    },
    secret
  );
}

export async function verifyToken(
  token: string,
  secret: string,
  alg: "HS256" | "HS384" | "HS512" = "HS256"
): Promise<any> {
  try {
    return await verify(token, secret, alg);
  } catch {
    return null;
  }
}

export function setAuthCookies(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  accessToken: string,
  refreshToken: string,
  expireMinutes: number = 60,
  expireDays: number = 7
) {
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") || url.protocol;
  const isSecure = proto.includes("https") || url.hostname !== "localhost";
  const sameSite = isSecure ? "None" : "Lax";
  const secureFlag = isSecure ? "; Secure" : "";

  const accessMaxAge = expireMinutes * 60;
  const refreshMaxAge = expireDays * 24 * 60 * 60;

  // Header Set-Cookie format matching standard FastAPI auth cookies
  c.header(
    "Set-Cookie",
    `access_token=${accessToken}; Path=/; Max-Age=${accessMaxAge}; HttpOnly${secureFlag}; SameSite=${sameSite}`,
    { append: true }
  );
  c.header(
    "Set-Cookie",
    `refresh_token=${refreshToken}; Path=/; Max-Age=${refreshMaxAge}; HttpOnly${secureFlag}; SameSite=${sameSite}`,
    { append: true }
  );
}

export function clearAuthCookies(c: Context) {
  for (const secure of [true, false]) {
    const sameSite = secure ? "None" : "Lax";
    const secureFlag = secure ? "; Secure" : "";
    c.header(
      "Set-Cookie",
      `access_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=${sameSite}`,
      { append: true }
    );
    c.header(
      "Set-Cookie",
      `refresh_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly${secureFlag}; SameSite=${sameSite}`,
      { append: true }
    );
  }
}
