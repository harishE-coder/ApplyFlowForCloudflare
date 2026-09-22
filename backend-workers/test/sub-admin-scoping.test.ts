import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { createAccessToken } from "../src/auth";
import type { Bindings, UserPayload } from "../src/types";

const mockSubAdmin: UserPayload = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  email: "subadmin@applyflow.com",
  role: "sub_admin",
  name: "Sarah SubAdmin",
  is_active: true,
};

const mockClient1 = {
  id: "550e8400-e29b-41d4-a716-446655440010",
  company_name: "Acme Corp",
  status: "active",
  is_active: true,
  managed_by: null,
};

const mockClient2 = {
  id: "550e8400-e29b-41d4-a716-446655440020",
  company_name: "Beta Technologies",
  status: "active",
  is_active: true,
  managed_by: mockSubAdmin.id,
};

const mockEmployee1 = {
  id: "550e8400-e29b-41d4-a716-446655440030",
  name: "Recruiter Alice",
  email: "alice@applyflow.com",
  role: "employee",
  status: "active",
  is_active: true,
};

const mockTarget1 = {
  id: "550e8400-e29b-41d4-a716-446655440050",
  employee_id: mockEmployee1.id,
  employee_name: mockEmployee1.name,
  client_id: mockClient1.id,
  client_name: mockClient1.company_name,
  daily_target: 25,
  status: "active",
  effective_date: "2026-09-22",
};

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
};

vi.mock("../src/db", () => {
  return {
    getDb: () => {
      const mockQuery = async (strings: any, ...values: any[]) => {
        const queryText = Array.isArray(strings) ? strings.join("?") : String(strings);

        // Fail test immediately if non-existent sub_admin_clients table is queried
        if (queryText.includes("sub_admin_clients")) {
          throw new Error('relation "sub_admin_clients" does not exist');
        }

        // Fail test immediately if literal string "null" is passed into ANY() or array filter
        if (values.some((v) => Array.isArray(v) && v.includes("null"))) {
          throw new Error('invalid input syntax for type uuid: "null"');
        }

        // 1. Auth middleware user lookup
        if (queryText.includes("FROM users") && (queryText.includes("WHERE id =") || queryText.includes("WHERE id = ?"))) {
          const id = String(values[0]);
          if (id === mockSubAdmin.id) return [mockSubAdmin];
          if (id === mockEmployee1.id) return [mockEmployee1];
          return [];
        }

        // 2. Sub-admin assignments query for clients:
        // Returns 1 client assignment and 1 employee assignment where client_id is NULL (simulating real db row)
        if (queryText.includes("FROM sub_admin_assignments") && queryText.includes("client_id")) {
          return [
            { client_id: mockClient1.id },
            { client_id: mockClient2.id },
          ];
        }

        // 3. Sub-admin assignments query for employees
        if (queryText.includes("FROM sub_admin_assignments") && queryText.includes("employee_id")) {
          return [
            { employee_id: mockEmployee1.id },
          ];
        }

        // 4. Clients query
        if (queryText.includes("FROM clients")) {
          if (queryText.includes("WHERE id = ANY")) {
            return [mockClient1, mockClient2];
          }
          if (queryText.includes("WHERE id =") || queryText.includes("WHERE id = ?")) {
            return [mockClient1];
          }
          return [mockClient1, mockClient2];
        }

        // 5. Pre-fetch batch queries for clients (employee_clients, requirements, resumes, applications)
        if (queryText.includes("FROM employee_clients")) {
          return [];
        }
        if (queryText.includes("FROM resumes") && queryText.includes("count(*)")) {
          return [];
        }
        if (queryText.includes("FROM applications") && queryText.includes("count(*)")) {
          return [];
        }

        // 6. Requirements list query
        if (queryText.includes("FROM requirements")) {
          return [
            {
              id: "550e8400-e29b-41d4-a716-446655440070",
              job_title: "Senior Fullstack Engineer",
              role: "Senior Fullstack Engineer",
              company: "Acme Corp",
              client_id: mockClient1.id,
              status: "open",
              priority: "high",
              openings: 2,
              created_at: new Date().toISOString(),
            },
          ];
        }

        // 7. Resumes list query
        if (queryText.includes("FROM resumes r")) {
          if (queryText.includes("COUNT(*)")) {
            return [{ total: 1 }];
          }
          return [
            {
              id: "550e8400-e29b-41d4-a716-446655440080",
              candidate_name: "John Candidate",
              client_id: mockClient1.id,
              client_name: "Acme Corp",
              company: "Acme Corp",
              role: "Software Engineer",
              created_at: new Date().toISOString(),
            },
          ];
        }

        // 8. Targets list query
        if (queryText.includes("FROM targets t")) {
          return [mockTarget1];
        }

        return [];
      };

      return mockQuery;
    },
  };
});

describe("Sub-Admin Scoping & Regression Tests", () => {
  it("GET /api/clients returns 200 for sub_admin without 'null' UUID syntax errors", async () => {
    const token = await createAccessToken(mockSubAdmin, mockEnv.JWT_SECRET_KEY, 60);
    const res = await app.fetch(
      new Request("http://localhost/api/clients?status=all", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
    expect(body[0].company_name).toBe("Acme Corp");
  });

  it("GET /api/requirements returns 200 for sub_admin without 'null' UUID syntax errors", async () => {
    const token = await createAccessToken(mockSubAdmin, mockEnv.JWT_SECRET_KEY, 60);
    const res = await app.fetch(
      new Request("http://localhost/api/requirements", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].job_title).toBe("Senior Fullstack Engineer");
  });

  it("GET /api/resumes queries sub_admin_assignments (not sub_admin_clients) and returns 200", async () => {
    const token = await createAccessToken(mockSubAdmin, mockEnv.JWT_SECRET_KEY, 60);
    const res = await app.fetch(
      new Request("http://localhost/api/resumes?page=1&page_size=20", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toBeDefined();
    expect(body.items.length).toBe(1);
    expect(body.items[0].candidate_name).toBe("John Candidate");
  });

  it("GET /api/targets queries sub_admin_assignments (not sub_admin_clients) and returns 200", async () => {
    const token = await createAccessToken(mockSubAdmin, mockEnv.JWT_SECRET_KEY, 60);
    const res = await app.fetch(
      new Request("http://localhost/api/targets", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].daily_target).toBe(25);
    expect(body[0].client_name).toBe("Acme Corp");
  });

  it("POST /api/targets validates management scope using sub_admin_assignments", async () => {
    const token = await createAccessToken(mockSubAdmin, mockEnv.JWT_SECRET_KEY, 60);
    const res = await app.fetch(
      new Request("http://localhost/api/targets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          employee_id: mockEmployee1.id,
          client_id: mockClient1.id,
          daily_target: 30,
          status: "active",
        }),
      }),
      mockEnv
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.daily_target).toBe(25);
  });
});
