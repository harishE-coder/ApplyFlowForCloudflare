import { describe, expect, it, vi } from "vitest";

const employeeUser: UserPayload = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  email: "employee@applyflow.com",
  role: "employee",
  name: "Regular Employee",
  is_active: true,
};

vi.mock("../src/db", () => {
  return {
    getDb: () => {
      return async (strings: TemplateStringsArray, ...values: any[]) => {
        const queryText = strings.join("?");
        if (queryText.includes("WHERE id =") || queryText.includes("WHERE id = ?")) {
          const id = String(values[0]);
          if (id === employeeUser.id) {
            return [employeeUser];
          }
        }
        return [];
      };
    },
  };
});

import app from "../src/index";
import { createAccessToken } from "../src/auth";
import type { Bindings, UserPayload } from "../src/types";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
};



describe("Sub-Admins Module Parity Tests", () => {
  it("GET /api/sub-admins returns 401 when unauthenticated", async () => {
    const res = await app.fetch(new Request("http://localhost/api/sub-admins"), mockEnv);
    expect(res.status).toBe(401);
  });

  it("POST /api/sub-admins returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/sub-admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Sub Admin", email: "sa@example.com", password: "pwd" }),
      }),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/sub-admins/:id/assignments returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/sub-admins/550e8400-e29b-41d4-a716-446655440000/assignments"),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/sub-admins/:id/assignments returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/sub-admins/550e8400-e29b-41d4-a716-446655440000/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_ids: [], employee_ids: [] }),
      }),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("PUT /api/sub-admins/:id returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/sub-admins/550e8400-e29b-41d4-a716-446655440000", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" }),
      }),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/sub-admins/:id/activate returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/sub-admins/550e8400-e29b-41d4-a716-446655440000/activate", {
        method: "POST",
      }),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("POST /api/sub-admins/:id/deactivate returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/sub-admins/550e8400-e29b-41d4-a716-446655440000/deactivate", {
        method: "POST",
      }),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("DELETE /api/sub-admins/:id returns 401 when unauthenticated", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/sub-admins/550e8400-e29b-41d4-a716-446655440000", {
        method: "DELETE",
      }),
      mockEnv
    );
    expect(res.status).toBe(401);
  });

  it("GET /api/sub-admins returns 403 when authenticated as employee", async () => {
    const token = await createAccessToken(employeeUser, mockEnv.JWT_SECRET_KEY!, 60);
    const res = await app.fetch(
      new Request("http://localhost/api/sub-admins", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      mockEnv
    );
    expect(res.status).toBe(403);
  });
});
