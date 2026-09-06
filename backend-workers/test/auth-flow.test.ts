import { describe, expect, it, vi, beforeEach } from "vitest";
import { hashPassword } from "../src/auth";
import type { Bindings } from "../src/types";

// Mock the database
const mockUsers = [
  {
    id: "a0000000-0000-0000-0000-000000000001",
    name: "Admin User",
    email: "admin@applyflow.com",
    hashed_password: "", // will be populated in beforeAll
    role: "admin",
    client_id: null,
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

vi.mock("../src/db", () => {
  return {
    getDb: () => {
      const mockQuery = async (strings: TemplateStringsArray, ...values: any[]) => {
        const queryText = strings.join("?");
        // Lookups by email
        if (queryText.includes("LOWER(email) =") || queryText.includes("email =")) {
          const email = String(values[0]).toLowerCase();
          const found = mockUsers.filter((u) => u.email.toLowerCase() === email);
          return found;
        }
        // Lookups by user id
        if (queryText.includes("WHERE id =") || queryText.includes("WHERE id = ?")) {
          const id = String(values[0]);
          const found = mockUsers.filter((u) => u.id === id);
          return found;
        }
        // Dashboard client count
        if (queryText.includes("FROM clients")) {
          return [{ count: 12 }];
        }
        // Dashboard applications count
        if (queryText.includes("FROM applications")) {
          return [{ count: 45 }];
        }
        // Fallback
        return [];
      };
      return mockQuery;
    },
  };
});

import app from "../src/index";

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "super-secret-jwt-key-for-testing-only-1234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/test/exec",
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
};

describe("Authentication & Page Refresh / Logout Verification Flows", () => {
  beforeEach(async () => {
    mockUsers[0].hashed_password = await hashPassword("AdminSecret123!");
  });

  it("Flow 1: Login -> refresh page (bootstrap) -> user remains authenticated", async () => {
    // 1. User submits login form
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@applyflow.com",
          password: "AdminSecret123!",
        }),
      }),
      mockEnv
    );

    expect(loginRes.status).toBe(200);
    const loginBody = await loginRes.json();
    expect(loginBody.user.email).toBe("admin@applyflow.com");
    expect(loginBody.user.role).toBe("admin");

    // Verify Set-Cookie headers contain access_token and refresh_token
    const setCookie = loginRes.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("access_token=");
    expect(setCookie).toContain("HttpOnly");

    // Extract access_token from Set-Cookie header
    const match = setCookie!.match(/access_token=([^;]+)/);
    expect(match).not.toBeNull();
    const accessToken = match![1];

    // 2. User refreshes page: React frontend calls GET /api/auth/bootstrap with cookie
    const bootstrapRes = await app.fetch(
      new Request("http://localhost/api/auth/bootstrap", {
        method: "GET",
        headers: {
          Cookie: `access_token=${accessToken}`,
        },
      }),
      mockEnv
    );

    expect(bootstrapRes.status).toBe(200);
    const bootstrapBody = await bootstrapRes.json();
    expect(bootstrapBody.user).toBeDefined();
    expect(bootstrapBody.user.email).toBe("admin@applyflow.com");
    expect(bootstrapBody.user.role).toBe("admin");
    expect(bootstrapBody.dashboard).toBeDefined();
    expect(bootstrapBody.dashboard.metrics.total_clients).toBe(12);
    expect(bootstrapBody.dashboard.metrics.total_applications).toBe(45);

    // 3. Authenticated user can also access protected APIs with the cookie
    const meRes = await app.fetch(
      new Request("http://localhost/api/auth/me", {
        method: "GET",
        headers: {
          Cookie: `access_token=${accessToken}`,
        },
      }),
      mockEnv
    );
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.email).toBe("admin@applyflow.com");
  });

  it("Flow 2: Logout -> cookies cleared -> protected routes return 401", async () => {
    // 1. User triggers logout
    const logoutRes = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
      }),
      mockEnv
    );

    expect(logoutRes.status).toBe(200);
    const logoutBody = await logoutRes.json();
    expect(logoutBody.message).toBe("Logged out");

    // Verify cookies are expired (Max-Age=0)
    const setCookie = logoutRes.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("Max-Age=0");

    // 2. Next request to GET /api/auth/bootstrap without cookies returns 401
    const bootstrapPostLogout = await app.fetch(
      new Request("http://localhost/api/auth/bootstrap", {
        method: "GET",
      }),
      mockEnv
    );
    expect(bootstrapPostLogout.status).toBe(401);
    const bootstrapError = await bootstrapPostLogout.json();
    expect(bootstrapError.detail).toBe("Not authenticated");

    // 3. Next request to GET /api/clients returns 401
    const clientsPostLogout = await app.fetch(
      new Request("http://localhost/api/clients", {
        method: "GET",
      }),
      mockEnv
    );
    expect(clientsPostLogout.status).toBe(401);

    // 4. Next request to GET /api/employees returns 401
    const employeesPostLogout = await app.fetch(
      new Request("http://localhost/api/employees", {
        method: "GET",
      }),
      mockEnv
    );
    expect(employeesPostLogout.status).toBe(401);

    // 5. Next request to GET /api/requirements returns 401
    const requirementsPostLogout = await app.fetch(
      new Request("http://localhost/api/requirements", {
        method: "GET",
      }),
      mockEnv
    );
    expect(requirementsPostLogout.status).toBe(401);

    // 6. Next request to GET /api/applications returns 401
    const applicationsPostLogout = await app.fetch(
      new Request("http://localhost/api/applications", {
        method: "GET",
      }),
      mockEnv
    );
    expect(applicationsPostLogout.status).toBe(401);
  });
});
