import { describe, expect, it } from "vitest";
import app from "../src/index";
import type { Bindings } from "../src/types";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
};

describe("Dashboard Module Parity Tests", () => {
  it("GET /api/dashboard/admin/home returns 401 when unauthenticated", async () => {
    const res = await app.fetch(new Request("http://localhost/api/dashboard/admin/home"), mockEnv);
    expect(res.status).toBe(401);
  });

  it("GET /api/dashboard/performance returns 401 when unauthenticated", async () => {
    const res = await app.fetch(new Request("http://localhost/api/dashboard/performance"), mockEnv);
    expect(res.status).toBe(401);
  });

  it("GET /api/dashboard/client/home returns 401 when unauthenticated", async () => {
    const res = await app.fetch(new Request("http://localhost/api/dashboard/client/home"), mockEnv);
    expect(res.status).toBe(401);
  });

  it("GET /api/dashboard/employee returns 401 when unauthenticated", async () => {
    const res = await app.fetch(new Request("http://localhost/api/dashboard/employee"), mockEnv);
    expect(res.status).toBe(401);
  });
});
