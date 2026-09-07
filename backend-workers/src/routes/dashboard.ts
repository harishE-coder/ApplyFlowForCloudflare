/**
 * Dashboard Router for Cloudflare Workers (Hono).
 * Full feature and API parity with FastAPI app.modules.dashboard.
 */

import { Hono } from "hono";
import { getDb } from "../db";
import { requireAuth } from "../middleware/auth";
import type { Bindings, UserPayload, Variables } from "../types";

export const dashboardRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All dashboard endpoints require authentication
dashboardRouter.use("*", requireAuth);

/**
 * Helper: Resolve dashboard scope based on user role
 */
async function resolveDashboardScope(
  sql: any,
  user: UserPayload
): Promise<{ allowedClientIds: string[] | null; allowedEmployeeIds: string[] | null }> {
  if (user.role === "super_admin" || user.role === "admin") {
    return { allowedClientIds: null, allowedEmployeeIds: null };
  }

  if (user.role === "sub_admin") {
    const [assignedClients, assignedEmployees] = await Promise.all([
      sql`
        SELECT client_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true AND client_id IS NOT NULL
        UNION
        SELECT id as client_id FROM clients WHERE managed_by = ${user.id}
      `,
      sql`
        SELECT saa.employee_id 
        FROM sub_admin_assignments saa
        JOIN users u ON saa.employee_id = u.id
        WHERE saa.sub_admin_id = ${user.id} AND saa.active = true AND saa.employee_id IS NOT NULL
          AND u.is_active = true AND u.status = 'active'
        UNION
        SELECT id as employee_id FROM users WHERE managed_by = ${user.id} AND is_active = true AND status = 'active'
      `,
    ]);
    return {
      allowedClientIds: assignedClients.map((r: any) => String(r.client_id)),
      allowedEmployeeIds: assignedEmployees.map((r: any) => String(r.employee_id)),
    };
  }

  if (user.role === "employee" || user.role === "recruiter") {
    const assigned = await sql`
      SELECT client_id FROM employee_clients WHERE employee_id = ${user.id} AND active = true
    `;
    const cids =
      assigned.length > 0
        ? assigned.map((r: any) => String(r.client_id))
        : (await sql`SELECT id FROM clients WHERE status = 'active'`).map((r: any) => String(r.id));
    return {
      allowedClientIds: cids,
      allowedEmployeeIds: [user.id],
    };
  }

  if (user.role === "client") {
    return {
      allowedClientIds: user.client_id ? [String(user.client_id)] : [],
      allowedEmployeeIds: [],
    };
  }

  return { allowedClientIds: [], allowedEmployeeIds: [] };
}

import {
  calculateTrend,
  getResumeStats,
  getApplicationStats,
  getTeamPerformanceMaps,
  getSevenDayTrend,
  buildDateFilter,
  APP_TIMEZONE,
  type DateRangeType,
  type MetricStats,
  type TeamPerformanceMaps,
} from "../services/dashboardMetrics";

export {
  calculateTrend,
  getResumeStats,
  getApplicationStats,
  getTeamPerformanceMaps,
  getSevenDayTrend,
  buildDateFilter,
  APP_TIMEZONE,
  type DateRangeType,
  type MetricStats,
};

/**
 * 1. GET /api/dashboard/admin/home (and GET /api/dashboard/home)
 * Consolidated admin & sub-admin dashboard metrics, cards, and dropdown metadata.
 */
dashboardRouter.get("/admin/home", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const clientId = c.req.query("client_id") || null;
  const employeeId = c.req.query("employee_id") || null;
  const dateRange = c.req.query("date_range") || c.req.query("date_filter") || "today";
  const customDate = c.req.query("custom_date") || null;

  try {
    const scope = await resolveDashboardScope(sql, user);

    // Filtered client scope
    let targetClientIds = scope.allowedClientIds;
    if (clientId) {
      if (scope.allowedClientIds !== null) {
        targetClientIds = scope.allowedClientIds.includes(clientId) ? [clientId] : [];
      } else {
        targetClientIds = [clientId];
      }
    }

    // Filtered employee scope
    let targetEmployeeIds = scope.allowedEmployeeIds;
    if (employeeId) {
      if (scope.allowedEmployeeIds !== null) {
        targetEmployeeIds = scope.allowedEmployeeIds.includes(employeeId) ? [employeeId] : [];
      } else {
        targetEmployeeIds = [employeeId];
      }
    }

    // Date calculations
    const todayStr = customDate || new Date().toISOString().split("T")[0];

    // 1. Overview counts - using shared dashboard metrics service
    const [
      clientsRes,
      reqsRes,
      activeReqsRes,
      employeesRes,
      subAdminsRes,
      uploadStats,
      appStats,
      targetsRes,
      activeJobsRes,
      completedTodayJobsRes,
      hiJobsRes,
      noUrlJobsRes,
    ] = await Promise.all([
      targetClientIds !== null
        ? sql`SELECT count(*)::int as c FROM clients WHERE is_active = true AND id = ANY(${targetClientIds})`
        : sql`SELECT count(*)::int as c FROM clients WHERE is_active = true`,
      targetClientIds !== null
        ? sql`SELECT count(*)::int as c FROM requirements WHERE client_id = ANY(${targetClientIds})`
        : sql`SELECT count(*)::int as c FROM requirements`,
      targetClientIds !== null
        ? sql`SELECT count(*)::int as c FROM requirements WHERE status = 'active' AND client_id = ANY(${targetClientIds})`
        : sql`SELECT count(*)::int as c FROM requirements WHERE status = 'active'`,
      targetEmployeeIds !== null
        ? (targetEmployeeIds.length > 0
            ? sql`SELECT count(*)::int as c FROM users WHERE role IN ('employee', 'recruiter') AND is_active = true AND status = 'active' AND id = ANY(${targetEmployeeIds})`
            : [{ c: 0 }])
        : sql`SELECT count(*)::int as c FROM users WHERE role IN ('employee', 'recruiter') AND is_active = true AND status = 'active'`,
      sql`SELECT count(*)::int as c FROM users WHERE role = 'sub_admin' AND is_active = true AND status = 'active'`,
      getResumeStats(sql, { targetClientIds, targetEmployeeIds }, dateRange, customDate),
      getApplicationStats(sql, { targetClientIds, targetEmployeeIds }, dateRange, customDate),
      (targetEmployeeIds !== null && targetEmployeeIds.length === 0) || (targetClientIds !== null && targetClientIds.length === 0)
        ? [{ c: 0 }]
        : targetEmployeeIds !== null && targetClientIds !== null
        ? sql`
            SELECT COALESCE(SUM(t.daily_target), 0)::int as c 
            FROM targets t 
            JOIN users u ON t.employee_id = u.id 
            WHERE t.status = 'active' AND u.is_active = true AND u.status = 'active'
              AND t.employee_id = ANY(${targetEmployeeIds})
              AND t.client_id = ANY(${targetClientIds})
          `
        : targetEmployeeIds !== null
        ? sql`
            SELECT COALESCE(SUM(t.daily_target), 0)::int as c 
            FROM targets t 
            JOIN users u ON t.employee_id = u.id 
            WHERE t.status = 'active' AND u.is_active = true AND u.status = 'active'
              AND t.employee_id = ANY(${targetEmployeeIds})
          `
        : targetClientIds !== null
        ? sql`
            SELECT COALESCE(SUM(t.daily_target), 0)::int as c 
            FROM targets t 
            JOIN users u ON t.employee_id = u.id 
            WHERE t.status = 'active' AND u.is_active = true AND u.status = 'active'
              AND t.client_id = ANY(${targetClientIds})
          `
        : sql`
            SELECT COALESCE(SUM(t.daily_target), 0)::int as c 
            FROM targets t 
            JOIN users u ON t.employee_id = u.id 
            WHERE t.status = 'active' AND u.is_active = true AND u.status = 'active'
          `,
      targetClientIds !== null
        ? sql`SELECT count(*)::int as c FROM requirements WHERE status = 'active' AND client_id = ANY(${targetClientIds})`
        : sql`SELECT count(*)::int as c FROM requirements WHERE status = 'active'`,
      targetClientIds !== null
        ? sql`SELECT count(*)::int as c FROM requirements WHERE status = 'done' AND (completed_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date AND client_id = ANY(${targetClientIds})`
        : sql`SELECT count(*)::int as c FROM requirements WHERE status = 'done' AND (completed_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date`,
      targetClientIds !== null
        ? sql`SELECT count(*)::int as c FROM requirements WHERE status = 'active' AND LOWER(priority) = 'high' AND client_id = ANY(${targetClientIds})`
        : sql`SELECT count(*)::int as c FROM requirements WHERE status = 'active' AND LOWER(priority) = 'high'`,
      targetClientIds !== null
        ? sql`SELECT count(*)::int as c FROM requirements WHERE status = 'active' AND (job_url IS NULL OR job_url = '') AND client_id = ANY(${targetClientIds})`
        : sql`SELECT count(*)::int as c FROM requirements WHERE status = 'active' AND (job_url IS NULL OR job_url = '')`,
    ]);

    const totalClients = clientsRes[0]?.c || 0;
    const totalRequirements = reqsRes[0]?.c || 0;
    const activeRequirements = activeReqsRes[0]?.c || 0;
    const totalEmployees = employeesRes[0]?.c || 0;
    const totalSubAdmins = subAdminsRes[0]?.c || 0;

    const totalResumes = uploadStats.total;
    const todayUploads = uploadStats.today;
    const yesterdayUploads = uploadStats.yesterday;
    const uploadsTrend = uploadStats.trend;

    const totalApplications = appStats.total;
    const todayApplications = appStats.today;
    const yesterdayApplications = appStats.yesterday;
    const applicationsTrend = appStats.trend;

    const targetSum = targetsRes[0]?.c || 0;
    const selectedApplications = appStats.count;
    const selectedUploads = uploadStats.count;
    const targetCompletionPct =
      targetSum > 0 ? Number(((selectedApplications / targetSum) * 100).toFixed(1)) : (selectedApplications > 0 ? 100.0 : 0.0);
    const activeJobs = activeJobsRes[0]?.c || 0;
    const completedTodayJobs = completedTodayJobsRes[0]?.c || 0;
    const highPriorityJobs = hiJobsRes[0]?.c || 0;
    const jobsWithoutUrl = noUrlJobsRes[0]?.c || 0;

    // 2. Application status distribution
    const statusCounts = await (targetClientIds !== null
      ? sql`SELECT status, count(*)::int as count FROM applications WHERE client_id = ANY(${targetClientIds}) GROUP BY status`
      : sql`SELECT status, count(*)::int as count FROM applications GROUP BY status`);
    const statusDistribution = statusCounts.map((r: any) => ({
      name: r.status || "Submitted",
      value: Number(r.count),
    }));

    // 3. 7-day upload and applications trend - shared helper
    const dailyUploadsTrend = await getSevenDayTrend(sql, targetSum);

    // 4. Dropdown metadata
    const [clientsList, empsList, targetsList] = await Promise.all([
      scope.allowedClientIds !== null
        ? sql`SELECT id, company_name FROM clients WHERE is_active = true AND id = ANY(${scope.allowedClientIds}) ORDER BY company_name ASC`
        : sql`SELECT id, company_name FROM clients WHERE is_active = true ORDER BY company_name ASC`,
      scope.allowedEmployeeIds !== null
        ? (scope.allowedEmployeeIds.length > 0
            ? sql`SELECT id, id as employee_id, name, email FROM users WHERE role IN ('employee', 'recruiter') AND is_active = true AND status = 'active' AND id = ANY(${scope.allowedEmployeeIds}) ORDER BY name ASC`
            : [])
        : sql`SELECT id, id as employee_id, name, email FROM users WHERE role IN ('employee', 'recruiter') AND is_active = true AND status = 'active' ORDER BY name ASC`,
      scope.allowedClientIds !== null
        ? (scope.allowedClientIds.length > 0
            ? sql`
                SELECT t.id, t.employee_id, t.client_id, t.daily_target, t.status 
                FROM targets t
                JOIN users u ON t.employee_id = u.id
                WHERE t.status = 'active' AND u.is_active = true AND u.status = 'active'
                  AND t.client_id = ANY(${scope.allowedClientIds})
              `
            : [])
        : sql`
            SELECT t.id, t.employee_id, t.client_id, t.daily_target, t.status 
            FROM targets t
            JOIN users u ON t.employee_id = u.id
            WHERE t.status = 'active' AND u.is_active = true AND u.status = 'active'
          `,
    ]);

    // 5. Team performance list - using shared getTeamPerformanceMaps
    const empUsers = empsList;
    const empIds = empUsers.map((e: any) => String(e.id));
    const [
      perfMaps,
      activeTargetsMap,
      empClientsRows,
    ] = await Promise.all([
      empIds.length > 0
        ? getTeamPerformanceMaps(sql, empIds, dateRange, customDate)
        : ({
            todayUploadsMap: {},
            yesterdayUploadsMap: {},
            totalUploadsMap: {},
            selectedUploadsMap: {},
            todayAppsMap: {},
            yesterdayAppsMap: {},
            totalAppsMap: {},
            selectedAppsMap: {},
          } as TeamPerformanceMaps),
      empIds.length > 0
        ? sql`
            SELECT t.employee_id, COALESCE(SUM(t.daily_target), 0)::int as target 
            FROM targets t 
            JOIN users u ON t.employee_id = u.id 
            WHERE t.employee_id = ANY(${empIds}) 
              AND t.status = 'active' 
              AND u.is_active = true 
              AND u.status = 'active' 
            GROUP BY t.employee_id
          `
        : [],
      empIds.length > 0
        ? sql`SELECT ec.employee_id, c.id, c.company_name FROM employee_clients ec JOIN clients c ON ec.client_id = c.id WHERE ec.employee_id = ANY(${empIds}) AND ec.active = true`
        : [],
    ]);

    const {
      todayUploadsMap,
      yesterdayUploadsMap,
      totalUploadsMap,
      selectedUploadsMap,
      todayAppsMap,
      yesterdayAppsMap,
      totalAppsMap,
      selectedAppsMap,
    } = perfMaps;

    const targetMap: Record<string, number> = {};
    for (const r of activeTargetsMap) targetMap[String(r.employee_id)] = Number(r.target);

    const clientsMap: Record<string, any[]> = {};
    for (const r of empClientsRows) {
      const eid = String(r.employee_id);
      if (!clientsMap[eid]) clientsMap[eid] = [];
      clientsMap[eid].push({ id: r.id, company_name: r.company_name });
    }

    const teamPerformance = empUsers.map((emp: any) => {
      const eid = String(emp.id);
      const totalUploads = totalUploadsMap[eid] || 0;
      const todayUploads = todayUploadsMap[eid] || 0;
      const yesterdayUploads = yesterdayUploadsMap[eid] || 0;
      const selectedUploads = selectedUploadsMap[eid] !== undefined ? selectedUploadsMap[eid] : todayUploads;
      const uploadsTrend = calculateTrend(todayUploads, yesterdayUploads);

      const totalApplications = totalAppsMap[eid] || 0;
      const todayApplications = todayAppsMap[eid] || 0;
      const yesterdayApplications = yesterdayAppsMap[eid] || 0;
      const selectedApplications = selectedAppsMap[eid] !== undefined ? selectedAppsMap[eid] : todayApplications;
      const applicationsTrend = calculateTrend(todayApplications, yesterdayApplications);

      const dt = targetMap[eid] || 0;
      const submitted = selectedApplications;
      const remaining = Math.max(0, dt - submitted);
      const cp = dt > 0 ? Number(((submitted / dt) * 100).toFixed(1)) : (submitted > 0 ? 100.0 : 0.0);

      return {
        id: emp.id,
        employee_id: emp.id,
        name: emp.name,
        email: emp.email,
        phone: emp.phone || null,
        status: "active",
        is_active: true,
        assigned_clients: clientsMap[eid] || [],
        total_uploads: totalUploads,
        today_uploads: todayUploads,
        yesterday_uploads: yesterdayUploads,
        selected_uploads: selectedUploads,
        uploads_trend: uploadsTrend,
        total_applications: totalApplications,
        today_applications: todayApplications,
        yesterday_applications: yesterdayApplications,
        selected_applications: selectedApplications,
        submitted: submitted,
        remaining: remaining,
        applications_trend: applicationsTrend,
        daily_target: dt,
        completion_percentage: cp,
      };
    });

    // 6. Client Cards
    const clientRows = clientsList;
    const clientIds = clientRows.map((c: any) => String(c.id));
    const [cReqs, cApps, cRecs] = await Promise.all([
      clientIds.length > 0
        ? sql`SELECT client_id, count(*)::int as count FROM requirements WHERE client_id = ANY(${clientIds}) AND status = 'active' GROUP BY client_id`
        : [],
      clientIds.length > 0
        ? sql`SELECT client_id, count(*)::int as count FROM applications WHERE client_id = ANY(${clientIds}) GROUP BY client_id`
        : [],
      clientIds.length > 0
        ? sql`
            SELECT ec.client_id, count(DISTINCT ec.employee_id)::int as count 
            FROM employee_clients ec
            JOIN users u ON ec.employee_id = u.id
            WHERE ec.client_id = ANY(${clientIds}) 
              AND ec.active = true 
              AND u.is_active = true 
              AND u.status = 'active'
            GROUP BY ec.client_id
          `
        : [],
    ]);

    const cReqMap: Record<string, number> = {};
    for (const r of cReqs) cReqMap[String(r.client_id)] = Number(r.count);

    const cAppMap: Record<string, number> = {};
    for (const r of cApps) cAppMap[String(r.client_id)] = Number(r.count);

    const cRecMap: Record<string, number> = {};
    for (const r of cRecs) cRecMap[String(r.client_id)] = Number(r.count);

    const clientCards = clientRows.map((cl: any) => {
      const cid = String(cl.id);
      return {
        id: cl.id,
        company_name: cl.company_name,
        contact_person: cl.contact_person || null,
        active_requirements_count: cReqMap[cid] || 0,
        applications_received_count: cAppMap[cid] || 0,
        active_recruiters_count: cRecMap[cid] || 0,
        completion_rate: 100.0,
        chart_data: dailyUploadsTrend,
      };
    });

    // 7. Attendance summary - Only today's check-ins
    const presentRecords = await sql`
      SELECT a.employee_id, u.name, u.email, a.check_in
      FROM attendance a
      JOIN users u ON a.employee_id = u.id
      WHERE a.work_date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
    `;
    const presentIds = new Set(presentRecords.map((r: any) => String(r.employee_id)));
    const absentList = empUsers
      .filter((e: any) => !presentIds.has(String(e.id)))
      .map((e: any) => ({
        user_id: e.id,
        name: e.name,
        email: e.email,
        phone: null,
      }));

    const attendanceSummary = {
      total_employees: empUsers.length,
      present_count: presentRecords.length,
      absent_count: absentList.length,
      present_list: presentRecords.map((r: any) => ({
        user_id: r.employee_id,
        name: r.name,
        email: r.email,
        check_in_time: r.check_in,
      })),
      absent_list: absentList,
    };

    const overview = {
      total_clients: totalClients,
      total_requirements: totalRequirements,
      active_requirements: activeRequirements,
      total_employees: totalEmployees,
      total_sub_admins: totalSubAdmins,
      total_resumes: totalResumes,
      total_applications: totalApplications,
      today_uploads: todayUploads,
      yesterday_uploads: yesterdayUploads,
      today_applications: todayApplications,
      yesterday_applications: yesterdayApplications,
      selected_uploads: selectedUploads,
      selected_applications: selectedApplications,
      date_range: dateRange,
      custom_date: customDate || (dateRange && /^\d{4}-\d{2}-\d{2}$/.test(dateRange) ? dateRange : null),
      uploads_trend: uploadsTrend,
      applications_trend: applicationsTrend,
      target_sum: targetSum,
      target_completion_pct: targetCompletionPct,
      active_jobs: activeJobs,
      completed_today_jobs: completedTodayJobs,
      high_priority_jobs: highPriorityJobs,
      jobs_without_url: jobsWithoutUrl,
      job_completion_trend: dailyUploadsTrend,
      daily_uploads_trend: dailyUploadsTrend,
      applications_trend_series: dailyUploadsTrend,
      application_status_distribution: statusDistribution,
      assigned_employees: empUsers.map((e: any) => ({ id: e.id, name: e.name, email: e.email })),
    };

    return c.json({
      overview,
      team_performance: teamPerformance,
      attendance_summary: attendanceSummary,
      client_cards: clientCards,
      clients: clientsList.map((cl: any) => ({ id: cl.id, company_name: cl.company_name })),
      all_employees: empUsers.map((e: any) => ({
        id: e.id,
        employee_id: e.id,
        name: e.name,
        email: e.email,
        assigned_clients: clientsMap[String(e.id)] || [],
      })),
      all_targets: targetsList.map((t: any) => ({
        id: t.id,
        employee_id: t.employee_id,
        client_id: t.client_id,
        daily_target: t.daily_target,
        status: t.status,
      })),
    });
  } catch (err: any) {
    console.error("[Dashboard Error]", err);
    return c.json({ detail: `Dashboard error: ${err.message}` }, 500);
  }
});

// Route alias for /api/dashboard/home to return admin home structure if admin
dashboardRouter.get("/home", async (c) => {
  const user = c.get("user");
  if (user.role === "admin" || user.role === "super_admin" || user.role === "sub_admin") {
    // Forward to /admin/home logic
    const adminHomeReq = new Request(c.req.url.replace("/dashboard/home", "/dashboard/admin/home"), c.req.raw);
    return dashboardRouter.fetch(adminHomeReq, c.env, c.executionCtx);
  }
  return c.json({ status: "ok", role: user.role });
});

/**
 * 2. GET /api/dashboard/performance
 * Live telemetry and database diagnostics.
 */
dashboardRouter.get("/performance", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  try {
    const [resCnt, appCnt, usrCnt, cliCnt, tgtCnt] = await Promise.all([
      sql`SELECT count(*)::int as c FROM resumes`,
      sql`SELECT count(*)::int as c FROM applications`,
      sql`SELECT count(*)::int as c FROM users`,
      sql`SELECT count(*)::int as c FROM clients`,
      sql`SELECT count(*)::int as c FROM targets`,
    ]);

    return c.json({
      timestamp: new Date().toISOString(),
      database_connected: true,
      db_engine: "Neon PostgreSQL (Serverless HTTP)",
      total_resumes: resCnt[0]?.c || 0,
      total_applications: appCnt[0]?.c || 0,
      total_users: usrCnt[0]?.c || 0,
      total_clients: cliCnt[0]?.c || 0,
      total_targets: tgtCnt[0]?.c || 0,
      cache_status: "Active (In-Memory Frontend SWR + Inflight Deduplication)",
    });
  } catch (err: any) {
    return c.json({ detail: `Performance error: ${err.message}` }, 500);
  }
});

/**
 * 3. GET /api/dashboard/client/home (and GET /api/dashboard/client)
 */
dashboardRouter.get("/client/home", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);
  const clientId = user.client_id;
  const dateRange = c.req.query("date_range") || c.req.query("date_filter") || "today";
  const customDate = c.req.query("custom_date") || null;

  try {
    let companyName = "Client Portal";
    if (clientId) {
      const clientRows = await sql`SELECT company_name, contact_person FROM clients WHERE id = ${clientId} LIMIT 1`;
      if (clientRows.length > 0) {
        companyName = clientRows[0].company_name;
      }
    }

    const [uploadStats, appStats, offersRes, timelineRows] = await Promise.all([
      getResumeStats(sql, { clientId: clientId ? String(clientId) : null }, dateRange, customDate),
      getApplicationStats(sql, { clientId: clientId ? String(clientId) : null }, dateRange, customDate),
      clientId
        ? sql`SELECT count(*)::int as c FROM applications WHERE client_id = ${clientId} AND status = 'Offer'`
        : [{ c: 0 }],
      clientId
        ? sql`
            SELECT
              a.id,
              a.resume_id,
              COALESCE(r.candidate_name, a.candidate_name, 'Candidate') as candidate_name,
              a.company as hiring_company,
              a.role,
              a.current_round as round,
              a.status,
              a.applied_date,
              r.drive_file_id,
              r.drive_view_url,
              r.drive_download_url,
              r.drive_web_view_link,
              r.drive_download_link,
              r.file_name,
              r.original_filename,
              r.mime_type
            FROM applications a
            LEFT JOIN resumes r ON a.resume_id = r.id
            WHERE a.client_id = ${clientId}
            ORDER BY a.applied_date DESC
            LIMIT 15
          `
        : [],
    ]);

    const totalResumes = uploadStats.total;
    const todayUploads = uploadStats.today;
    const yesterdayUploads = uploadStats.yesterday;
    const uploadsTrend = uploadStats.trend;

    const totalApplications = appStats.total;
    const todayApplications = appStats.today;
    const yesterdayApplications = appStats.yesterday;
    const applicationsTrend = appStats.trend;

    const dashboard = {
      company_name: companyName,
      contact_person: null,
      applied_count: totalApplications,
      total_applications: totalApplications,
      today_applications: todayApplications,
      yesterday_applications: yesterdayApplications,
      applications_trend: applicationsTrend,
      total_resumes: totalResumes,
      today_uploads: todayUploads,
      yesterday_uploads: yesterdayUploads,
      uploads_trend: uploadsTrend,
      interview_updates: 0,
      offers_count: offersRes[0]?.c || 0,
      joined_count: 0,
      active_jobs: 0,
      completed_jobs: 0,
      completion_rate: 100.0,
      application_progress: [
        { stage: "Applied", count: totalApplications },
        { stage: "Interview", count: 0 },
        { stage: "Offer", count: offersRes[0]?.c || 0 },
        { stage: "Joined", count: 0 },
      ],
      application_timeline: timelineRows.map((t: any) => ({
        id: t.id,
        resume_id: t.resume_id,
        candidate_name: t.candidate_name || "Candidate",
        hiring_company: t.hiring_company || companyName,
        role: t.role || "Software Engineer",
        round: t.round || "Applied",
        status: t.status || "Submitted",
        applied_date: t.applied_date ? String(t.applied_date).split("T")[0] : "Recent",
        drive_file_id: t.drive_file_id || null,
        drive_view_url: t.drive_view_url || t.drive_web_view_link || (t.drive_file_id ? `https://drive.google.com/file/d/${t.drive_file_id}/view?usp=sharing` : null),
        drive_download_url: t.drive_download_url || t.drive_download_link || (t.drive_file_id ? `https://drive.google.com/uc?export=download&id=${t.drive_file_id}` : null),
        drive_web_view_link: t.drive_view_url || t.drive_web_view_link || (t.drive_file_id ? `https://drive.google.com/file/d/${t.drive_file_id}/view?usp=sharing` : null),
        drive_download_link: t.drive_download_url || t.drive_download_link || (t.drive_file_id ? `https://drive.google.com/uc?export=download&id=${t.drive_file_id}` : null),
        file_name: t.file_name || t.original_filename || null,
        mime_type: t.mime_type || "application/pdf",
        events: [],
      })),
      hiring_companies: [companyName],
      applications_sent: totalApplications,
      active_requirements_count: 0,
    };

    return c.json({ dashboard, chat_room_id: null });
  } catch (err: any) {
    return c.json({ detail: `Client dashboard error: ${err.message}` }, 500);
  }
});
dashboardRouter.get("/client", async (c) => {
  const req = new Request(c.req.url.replace("/dashboard/client", "/dashboard/client/home"), c.req.raw);
  return dashboardRouter.fetch(req, c.env, c.executionCtx);
});

/**
 * 4. GET /api/dashboard/employee (and GET /api/dashboard/employee/home)
 */
const employeeDashboardHandler = async (c: any) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);
  const dateRange = c.req.query("date_range") || c.req.query("date_filter") || "today";
  const customDate = c.req.query("custom_date") || null;

  try {
    const [uploadStats, appStats, targetRes, assignedClientsRows, recentResumesRows] = await Promise.all([
      getResumeStats(sql, { employeeId: user.id }, dateRange, customDate),
      getApplicationStats(sql, { employeeId: user.id }, dateRange, customDate),
      sql`
        SELECT COALESCE(SUM(t.daily_target), 0)::int as c 
        FROM targets t
        JOIN users u ON t.employee_id = u.id
        WHERE t.employee_id = ${user.id} 
          AND t.status = 'active' 
          AND u.is_active = true 
          AND u.status = 'active'
      `,
      sql`SELECT ec.client_id as id, c.company_name FROM employee_clients ec JOIN clients c ON ec.client_id = c.id WHERE ec.employee_id = ${user.id} AND ec.active = true`,
      sql`
        SELECT
          r.id,
          r.candidate_name,
          r.company,
          r.role,
          r.resume_id_tag,
          r.client_id,
          c.company_name as client_name,
          r.upload_date,
          r.drive_file_id,
          r.drive_view_url,
          r.drive_download_url,
          r.drive_web_view_link,
          r.drive_download_link,
          r.file_name,
          r.original_filename,
          r.mime_type
        FROM resumes r
        LEFT JOIN clients c ON c.id = r.client_id
        WHERE r.uploaded_by = ${user.id}
        ORDER BY r.upload_date DESC
        LIMIT 10
      `,
    ]);

    const totalUploads = uploadStats.total;
    const todayUploads = uploadStats.today;
    const yesterdayUploads = uploadStats.yesterday;
    const uploadsTrend = uploadStats.trend;

    const totalApplications = appStats.total;
    const todayApplications = appStats.today;
    const yesterdayApplications = appStats.yesterday;
    const applicationsTrend = appStats.trend;

    const todayTarget = targetRes[0]?.c || 0;
    const targetProgressPct = todayTarget > 0 ? Number(((todayApplications / todayTarget) * 100).toFixed(1)) : (todayApplications > 0 ? 100.0 : 0.0);

    const assignedClients = assignedClientsRows.map((cl: any) => ({
      id: cl.id,
      company_name: cl.company_name,
      active_requirements_count: 0,
      applications_count: 0,
      growth: "+12%",
    }));

    const recentUploadedResumes = recentResumesRows.map((r: any) => ({
      id: r.id,
      candidate_name: r.candidate_name || "Candidate",
      company: r.company || "Company",
      role: r.role || "Role",
      resume_id_tag: r.resume_id_tag || null,
      client_id: r.client_id,
      client_name: r.client_name || "Client",
      upload_date: r.upload_date,
      drive_file_id: r.drive_file_id || null,
      drive_view_url: r.drive_view_url || r.drive_web_view_link || (r.drive_file_id ? `https://drive.google.com/file/d/${r.drive_file_id}/view?usp=sharing` : null),
      drive_download_url: r.drive_download_url || r.drive_download_link || (r.drive_file_id ? `https://drive.google.com/uc?export=download&id=${r.drive_file_id}` : null),
      drive_web_view_link: r.drive_view_url || r.drive_web_view_link || (r.drive_file_id ? `https://drive.google.com/file/d/${r.drive_file_id}/view?usp=sharing` : null),
      drive_download_link: r.drive_download_url || r.drive_download_link || (r.drive_file_id ? `https://drive.google.com/uc?export=download&id=${r.drive_file_id}` : null),
      file_name: r.file_name || r.original_filename || null,
      mime_type: r.mime_type || "application/pdf",
    }));

    const dashboard = {
      today_uploads: todayUploads,
      yesterday_uploads: yesterdayUploads,
      total_uploads: totalUploads,
      uploads_trend: uploadsTrend,
      today_applications: todayApplications,
      yesterday_applications: yesterdayApplications,
      total_applications: totalApplications,
      applications_sent_today: todayApplications,
      total_applications_sent: totalApplications,
      applications_trend: applicationsTrend,
      today_target: todayTarget,
      target_achieved: todayApplications,
      target_progress_pct: targetProgressPct,
      target_summary: {
        target: todayTarget,
        submitted: todayApplications,
        remaining: Math.max(todayTarget - todayApplications, 0),
        completion: todayTarget > 0 ? Math.round((todayApplications / todayTarget) * 100) : 0,
      },
      assigned_clients_count: assignedClients.length,
      active_jobs: 0,
      completed_today_jobs: 0,
      high_priority_jobs: 0,
      recent_completed_jobs: [],
      ai_inbox_stats: {
        emails_processed: 0,
        interview_emails_detected: 0,
        pending_review: 0,
        upcoming_interviews: 0,
      },
      assigned_clients: assignedClients,
      client_requirements: [],
      weekly_trend: [],
      recent_activity: [],
      recent_uploaded_resumes: recentUploadedResumes,
    };

    return c.json(dashboard);
  } catch (err: any) {
    return c.json({ detail: `Employee dashboard error: ${err.message}` }, 500);
  }
};

dashboardRouter.get("/employee", employeeDashboardHandler);
dashboardRouter.get("/employee/home", employeeDashboardHandler);

/**
 * 5. GET /api/dashboard/stats (legacy)
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
