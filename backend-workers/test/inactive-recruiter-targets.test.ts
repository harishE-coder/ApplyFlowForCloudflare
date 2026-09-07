import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { createAccessToken } from "../src/auth";
import type { Bindings } from "../src/types";

const mockUsers = [
  {
    id: "admin-1",
    name: "Admin User",
    email: "admin@applyflow.com",
    role: "admin",
    status: "active",
    is_active: true,
  },
  {
    id: "harish-1",
    name: "Harish",
    email: "abblu@gmail.com",
    role: "employee",
    status: "active",
    is_active: true,
  },
  {
    id: "jyothi-1",
    name: "Jyothi",
    email: "jyothi@gmail.com",
    role: "employee",
    status: "active",
    is_active: true,
  },
  {
    id: "qa-recruiter-inactive",
    name: "QA Recruiter",
    email: "qa_recruiter@applyflow.com",
    role: "employee",
    status: "inactive",
    is_active: false,
  },
];

const mockClients = [
  { id: "cli-suresh", company_name: "Suresh", is_active: true },
  { id: "cli-sreya", company_name: "Sreya", is_active: true },
  { id: "cli-abc", company_name: "ABC Staffing", is_active: true },
];

// Active targets for Harish (24) and Jyothi (25)
// Inactive QA Recruiter has target 33
const mockTargets = [
  { id: "t-1", employee_id: "harish-1", client_id: "cli-suresh", daily_target: 24, status: "active" },
  { id: "t-2", employee_id: "jyothi-1", client_id: "cli-sreya", daily_target: 25, status: "active" },
  { id: "t-3", employee_id: "qa-recruiter-inactive", client_id: "cli-abc", daily_target: 33, status: "paused" },
];

vi.mock("../src/db", () => {
  return {
    getDb: () => {
      const mockQuery = async (strings: any, ...values: any[]) => {
        const queryText = Array.isArray(strings) ? strings.join("?") : String(strings);

        // Admin home users lookup for auth middleware
        if (queryText.includes("FROM users") && (queryText.includes("WHERE id =") || queryText.includes("WHERE id = ?"))) {
          const id = String(values[0]);
          return mockUsers.filter((u) => u.id === id);
        }

        // Target sum calculation (Admin dashboard)
        // Must join users and filter u.is_active = true AND u.status = 'active'
        if (queryText.includes("FROM targets t") && queryText.includes("JOIN users u")) {
          if (queryText.includes("GROUP BY t.employee_id")) {
            const result: any[] = [];
            for (const t of mockTargets) {
              const u = mockUsers.find((user) => user.id === t.employee_id);
              if (t.status === "active" && u && u.is_active && u.status === "active") {
                result.push({ employee_id: t.employee_id, target: t.daily_target });
              }
            }
            return result;
          }

          if (queryText.includes("SUM(t.daily_target)")) {
            // Join targets with users: only count if user is active
            let sum = 0;
            for (const t of mockTargets) {
              const u = mockUsers.find((user) => user.id === t.employee_id);
              if (t.status === "active" && u && u.is_active && u.status === "active") {
                sum += t.daily_target;
              }
            }
            return [{ c: sum }];
          }

          // targets list
          const activeTargets: any[] = [];
          for (const t of mockTargets) {
            const u = mockUsers.find((user) => user.id === t.employee_id);
            if (t.status === "active" && u && u.is_active && u.status === "active") {
              activeTargets.push(t);
            }
          }
          return activeTargets;
        }

        // Active recruiters list
        if (queryText.includes("FROM users") && queryText.includes("role IN ('employee', 'recruiter')")) {
          return mockUsers.filter((u) => (u.role === "employee" || u.role === "recruiter") && u.is_active && u.status === "active");
        }

        if (queryText.includes("FROM clients")) {
          return mockClients;
        }

        if (queryText.includes("FROM requirements")) {
          return [{ c: 5 }];
        }

        if (queryText.includes("generate_series")) {
          return [
            { date: "2026-09-01", uploads: 1, applications: 1 },
            { date: "2026-09-02", uploads: 2, applications: 2 },
            { date: "2026-09-03", uploads: 1, applications: 0 },
            { date: "2026-09-04", uploads: 3, applications: 1 },
            { date: "2026-09-05", uploads: 0, applications: 0 },
            { date: "2026-09-06", uploads: 2, applications: 1 },
            { date: "2026-09-07", uploads: 1, applications: 1 },
          ];
        }

        if (queryText.includes("FROM resumes")) {
          return [{ total: 10, today: 2, yesterday: 1, range_count: 2 }];
        }

        if (queryText.includes("FROM applications")) {
          return [{ total: 10, today: 3, yesterday: 2, range_count: 3 }];
        }

        if (queryText.includes("FROM employee_clients")) {
          return [];
        }

        if (queryText.includes("FROM attendance")) {
          return [];
        }

        return [];
      };
      return mockQuery;
    },
  };
});

const mockEnv: Bindings = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/testdb",
  JWT_SECRET_KEY: "test-secret-key-12345678901234567890",
  ACCESS_TOKEN_EXPIRE_MINUTES: "60",
  REFRESH_TOKEN_EXPIRE_DAYS: "7",
  FRONTEND_URL: "http://localhost:5173",
  APP_CORS_ORIGINS: "http://localhost:5173",
};

describe("Inactive Recruiter Target Exclusion Integration Tests", () => {
  it("GET /api/dashboard/admin/home strictly excludes inactive recruiters from target_sum", async () => {
    const adminToken = await createAccessToken(
      {
        id: "admin-1",
        email: "admin@applyflow.com",
        name: "Admin User",
        role: "admin",
        client_id: null,
      },
      mockEnv.JWT_SECRET_KEY,
      60
    );

    const res = await app.fetch(
      new Request("http://localhost/api/dashboard/admin/home", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Cookie: `access_token=${adminToken}`,
        },
      }),
      mockEnv
    );

    const resText = await res.text();
    expect(res.status).toBe(200);
    const body = JSON.parse(resText);

    // Harish target: 24, Jyothi target: 25 => Active Total: 49
    // QA Recruiter (inactive): 33 => MUST NOT BE INCLUDED!
    expect(body.overview.target_sum).toBe(49);
    expect(body.overview.target_sum).not.toBe(82);

    // Team performance must only list active recruiters (Harish and Jyothi)
    const empNames = body.team_performance.map((e: any) => e.name);
    expect(empNames).toContain("Harish");
    expect(empNames).toContain("Jyothi");
    expect(empNames).not.toContain("QA Recruiter");

    // Recruiter targets
    const harishPerf = body.team_performance.find((e: any) => e.name === "Harish");
    expect(harishPerf.daily_target).toBe(24);

    const jyothiPerf = body.team_performance.find((e: any) => e.name === "Jyothi");
    expect(jyothiPerf.daily_target).toBe(25);
  });
});
