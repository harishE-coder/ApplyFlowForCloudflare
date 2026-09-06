import { Hono } from "hono";
import { getDb } from "../db";
import { requireAuth } from "../middleware/auth";
import type { Bindings, Variables } from "../types";

export const dashboardRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All dashboard endpoints require authentication
dashboardRouter.use("*", requireAuth);

/**
 * Universal Dashboard Endpoint (GET /api/dashboard/home)
 * Dispatches by user role and returns summary stats, cards, and recent records.
 */
dashboardRouter.get("/home", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  try {
    // 1. Overview counts
    const [clientsRes, employeesRes, appsRes, resumesRes] = await Promise.all([
      sql`SELECT count(*)::int as count FROM clients WHERE is_active = true`,
      sql`SELECT count(*)::int as count FROM users WHERE role IN ('employee', 'recruiter') AND is_active = true`,
      sql`SELECT count(*)::int as count FROM applications`,
      sql`SELECT count(*)::int as count FROM resumes`,
    ]);

    const totalClients = clientsRes[0]?.count || 0;
    const totalEmployees = employeesRes[0]?.count || 0;
    const totalApplications = appsRes[0]?.count || 0;
    const totalResumes = resumesRes[0]?.count || 0;

    // 2. Status breakdown for applications
    const statusCounts = await sql`
      SELECT status, count(*)::int as count
      FROM applications
      GROUP BY status
    `;
    const statusMap: Record<string, number> = {};
    for (const row of statusCounts) {
      if (row.status) statusMap[String(row.status)] = Number(row.count);
    }

    // 3. Recent 5 applications
    const recentApps = await sql`
      SELECT a.id, a.candidate_name, a.company, a.role, a.status, a.round, a.created_at
      FROM applications a
      ORDER BY a.created_at DESC
      LIMIT 5
    `;

    return c.json({
      role: user.role,
      metrics: {
        total_clients: totalClients,
        total_employees: totalEmployees,
        total_applications: totalApplications,
        total_resumes: totalResumes,
        interviews_scheduled: statusMap["Round 1"] || statusMap["Interview"] || 0,
        offers: statusMap["Offer"] || 0,
        shortlisted: statusMap["Shortlisted"] || 0,
        status_breakdown: statusMap,
      },
      recent_applications: recentApps,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return c.json({ detail: `Dashboard query error: ${err.message}` }, 500);
  }
});

/**
 * Legacy/Direct stats endpoint (GET /api/dashboard/stats)
 */
dashboardRouter.get("/stats", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  try {
    const counts = await sql`
      SELECT
        (SELECT count(*)::int FROM clients WHERE is_active = true) as clients,
        (SELECT count(*)::int FROM users WHERE is_active = true) as users,
        (SELECT count(*)::int FROM applications) as applications,
        (SELECT count(*)::int FROM resumes) as resumes
    `;
    return c.json(counts[0] || {});
  } catch (err: any) {
    return c.json({ detail: `Stats error: ${err.message}` }, 500);
  }
});
