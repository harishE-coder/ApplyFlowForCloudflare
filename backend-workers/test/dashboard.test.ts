import { describe, expect, it } from "vitest";
import app from "../src/index";
import {
  calculateTrend,
  getResumeStats,
  getApplicationStats,
  getTeamPerformanceMaps,
  getSevenDayTrend,
  buildDateFilter,
} from "../src/routes/dashboard";
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

  describe("Shared Dashboard Metrics Service Tests", () => {
    it("returns zero stats immediately for empty scope array without DB error", async () => {
      const mockSql = () => { throw new Error("Should not be called"); };
      const res = await getResumeStats(mockSql, { targetClientIds: [] });
      expect(res).toMatchObject({ total: 0, today: 0, yesterday: 0, trend: 0 });

      const appRes = await getApplicationStats(mockSql, { targetEmployeeIds: [] });
      expect(appRes).toMatchObject({ total: 0, today: 0, yesterday: 0, trend: 0 });
    });

    it("calculates total, today, yesterday, and trend for getResumeStats", async () => {
      const mockSql = async () => [{ total: 10, today: 8, yesterday: 5 }];
      const stats = await getResumeStats(mockSql, { employeeId: "emp-1" });
      expect(stats.total).toBe(10);
      expect(stats.today).toBe(8);
      expect(stats.yesterday).toBe(5);
      expect(stats.trend).toBe(60); // (8-5)/5 = +60%
    });

    it("calculates total, today, yesterday, and trend for getApplicationStats", async () => {
      const mockSql = async () => [{ total: 15, today: 5, yesterday: 8 }];
      const stats = await getApplicationStats(mockSql, { clientId: "cli-1" });
      expect(stats.total).toBe(15);
      expect(stats.today).toBe(5);
      expect(stats.yesterday).toBe(8);
      expect(stats.trend).toBe(-38); // (5-8)/8 = -38%
    });

    it("supports range queries like last7, last30, and month for getResumeStats", async () => {
      const mockSql = async () => [{ total: 100, today: 8, yesterday: 5, range_count: 42 }];
      const stats = await getResumeStats(mockSql, { employeeId: "emp-1" }, "last7");
      expect(stats.total).toBe(100);
      expect(stats.today).toBe(8);
      expect(stats.yesterday).toBe(5);
      expect(stats.trend).toBe(60);
      expect(stats.count).toBe(42);
      expect(stats.range).toBe("last7");

      const monthStats = await getResumeStats(mockSql, {}, "month");
      expect(monthStats.range).toBe("month");
      expect(monthStats.count).toBe(42);
    });

    it("supports range queries for getApplicationStats", async () => {
      const mockSql = async () => [{ total: 200, today: 12, yesterday: 15, range_count: 85 }];
      const stats = await getApplicationStats(mockSql, { clientId: "cli-1" }, "last30");
      expect(stats.total).toBe(200);
      expect(stats.today).toBe(12);
      expect(stats.yesterday).toBe(15);
      expect(stats.trend).toBe(-20);
      expect(stats.count).toBe(85);
      expect(stats.range).toBe("last30");
    });

    it("handles getTeamPerformanceMaps empty array gracefully", async () => {
      const mockSql = () => { throw new Error("Should not be called"); };
      const maps = await getTeamPerformanceMaps(mockSql, []);
      expect(maps.todayUploadsMap).toEqual({});
      expect(maps.todayAppsMap).toEqual({});
    });

    it("builds correct IST timezone conditions in buildDateFilter", () => {
      const col = "COALESCE(created_at, upload_date)";
      const todayCond = buildDateFilter(col, "today");
      expect(todayCond).toContain("Asia/Kolkata");
      expect(todayCond).toContain("= (NOW() AT TIME ZONE 'Asia/Kolkata')::date");

      const yesterdayCond = buildDateFilter(col, "yesterday");
      expect(yesterdayCond).toContain("INTERVAL '1 day'");

      const last7Cond = buildDateFilter(col, "last7");
      expect(last7Cond).toContain("INTERVAL '6 days'");

      const monthCond = buildDateFilter(col, "month");
      expect(monthCond).toContain("DATE_TRUNC('month'");

      const last30Cond = buildDateFilter(col, "last30");
      expect(last30Cond).toContain("INTERVAL '29 days'");

      const customCond = buildDateFilter(col, "custom", "2026-09-07");
      expect(customCond).toContain("'2026-09-07'::date");

      const directDateCond = buildDateFilter(col, "2026-09-06");
      expect(directDateCond).toContain("'2026-09-06'::date");

      const weekCond = buildDateFilter(col, "this_week");
      expect(weekCond).toContain("DATE_TRUNC('week'");

      const allCond = buildDateFilter(col, "all");
      expect(allCond).toBe("1=1");
    });
  });

  describe("calculateTrend Specification Tests", () => {
    it("returns +60% when yesterday=5 and today=8", () => {
      expect(calculateTrend(8, 5)).toBe(60);
    });

    it("returns -38% when yesterday=8 and today=5", () => {
      expect(calculateTrend(5, 8)).toBe(-38);
    });

    it("returns +100% when yesterday=0 and today=4", () => {
      expect(calculateTrend(4, 0)).toBe(100);
    });

    it("returns 0% when yesterday=0 and today=0", () => {
      expect(calculateTrend(0, 0)).toBe(0);
    });

    it("returns 0% when yesterday=5 and today=5", () => {
      expect(calculateTrend(5, 5)).toBe(0);
    });
  });
});

