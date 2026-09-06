/**
 * Applications Router for Cloudflare Workers (Hono).
 * Full feature and API parity with FastAPI app.modules.applications.router.
 */

import { Hono } from "hono";
import { getDb } from "../db";
import { requireAuth, requireRoles } from "../middleware/auth";
import {
  ApplicationCreateSchema,
  ApplicationNotesUpdateSchema,
  ApplicationStatusUpdateSchema,
} from "../schemas/applications";
import type { Bindings, UserPayload, Variables } from "../types";

export const applicationsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All application endpoints require authentication
applicationsRouter.use("*", requireAuth);

/**
 * Helper: Resolve permitted client IDs for scoping applications
 */
async function getScopedClientIdsForApps(sql: any, user: UserPayload): Promise<string[] | null> {
  if (user.role === "super_admin") {
    return null; // Global access
  }

  if (user.role === "sub_admin") {
    const assigned = await sql`
      SELECT client_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true
      UNION
      SELECT id as client_id FROM clients WHERE managed_by = ${user.id}
    `;
    return assigned.map((r: any) => String(r.client_id));
  }

  if (user.role === "employee" || user.role === "recruiter") {
    const assigned = await sql`
      SELECT client_id FROM employee_clients WHERE employee_id = ${user.id} AND active = true
    `;
    if (assigned.length > 0) {
      return assigned.map((r: any) => String(r.client_id));
    }
    const activeClients = await sql`SELECT id as client_id FROM clients WHERE status = 'active'`;
    return activeClients.map((r: any) => String(r.client_id));
  }

  if (user.role === "client") {
    return user.client_id ? [String(user.client_id)] : [];
  }

  return [];
}

/**
 * Helper: Batch enrichment of applications with Resume, Client, Employee, and Event metadata
 */
async function enrichApplications(sql: any, apps: any[]): Promise<any[]> {
  if (!apps || apps.length === 0) return [];

  const appIds = apps.map((a) => String(a.id));
  const resumeIds = [...new Set(apps.map((a) => String(a.resume_id)).filter(Boolean))];
  const clientIds = [...new Set(apps.map((a) => String(a.client_id)).filter(Boolean))];
  const employeeIds = [...new Set(apps.map((a) => String(a.employee_id)).filter(Boolean))];
  const reqIds = [...new Set(apps.map((a) => String(a.requirement_id)).filter(Boolean))];

  // 1. Resumes
  const resumeMap: Record<string, any> = {};
  if (resumeIds.length > 0) {
    const resumes = await sql`
      SELECT id, display_id, candidate_name, company, role FROM resumes WHERE id = ANY(${resumeIds})
    `;
    for (const r of resumes) {
      resumeMap[String(r.id)] = r;
    }
  }

  // 2. Clients
  const clientMap: Record<string, string> = {};
  if (clientIds.length > 0) {
    const clients = await sql`SELECT id, company_name FROM clients WHERE id = ANY(${clientIds})`;
    for (const c of clients) {
      clientMap[String(c.id)] = c.company_name;
    }
  }

  // 3. Employees
  const employeeMap: Record<string, string> = {};
  if (employeeIds.length > 0) {
    const users = await sql`SELECT id, name FROM users WHERE id = ANY(${employeeIds})`;
    for (const u of users) {
      employeeMap[String(u.id)] = u.name;
    }
  }

  // 4. Requirements
  const reqMap: Record<string, string> = {};
  if (reqIds.length > 0) {
    const reqs = await sql`SELECT id, role_code FROM requirements WHERE id = ANY(${reqIds})`;
    for (const r of reqs) {
      reqMap[String(r.id)] = r.role_code;
    }
  }

  // 5. Events
  const eventsRows = await sql`
    SELECT id, application_id, event_type, round_name, event_date, interview_date, created_at
    FROM application_events
    WHERE application_id = ANY(${appIds})
    ORDER BY created_at DESC
  `;
  const eventsMap: Record<string, any[]> = {};
  for (const ev of eventsRows) {
    const aid = String(ev.application_id);
    if (!eventsMap[aid]) eventsMap[aid] = [];
    eventsMap[aid].push({
      id: ev.id,
      application_id: ev.application_id,
      event_type: ev.event_type,
      round_name: ev.round_name || null,
      event_date: ev.event_date || null,
      interview_date: ev.interview_date || null,
      created_at: ev.created_at,
    });
  }

  return apps.map((a) => {
    const aid = String(a.id);
    const resume = resumeMap[String(a.resume_id)] || {};
    const cid = String(a.client_id);
    const eid = String(a.employee_id);
    const rid = String(a.requirement_id);

    return {
      id: a.id,
      resume_id: a.resume_id,
      resume_display_id: resume.display_id || "RES-000",
      candidate_name: resume.candidate_name || a.candidate_name || "Candidate",
      company: resume.company || a.company || "Company",
      role: resume.role || a.role || "Role",
      requirement_id: a.requirement_id || null,
      requirement_code: reqMap[rid] || null,
      client_id: a.client_id,
      client_name: clientMap[cid] || "Client",
      employee_id: a.employee_id,
      employee_name: employeeMap[eid] || "Recruiter",
      status: a.status,
      current_round: a.current_round || "Initial Application",
      interview_date: a.interview_date || null,
      confidence: a.confidence || 0,
      is_ai_processed: Boolean(a.is_ai_processed),
      applied_date: a.applied_date,
      updated_at: a.updated_at || null,
      client_notes: a.client_notes || null,
      is_note_shared: a.is_note_shared !== undefined ? Boolean(a.is_note_shared) : true,
      events: eventsMap[aid] || [],
    };
  });
}

/**
 * 1. GET /api/applications (List with pagination and filtering)
 */
applicationsRouter.get("/", async (c) => {
  const user = c.get("user");
  const filterClientId = c.req.query("client_id");
  const filterReqId = c.req.query("requirement_id");
  const filterEmpId = c.req.query("employee_id");
  const filterStatus = c.req.query("status");
  const search = c.req.query("search");
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(c.req.query("page_size")) || 50));
  const offset = (page - 1) * pageSize;

  const sql = getDb(c.env.DATABASE_URL);

  const scopedCids = await getScopedClientIdsForApps(sql, user);
  if (scopedCids !== null && scopedCids.length === 0) {
    return c.json({ items: [], total: 0, page, page_size: pageSize });
  }

  let apps: any[];
  let totalCount = 0;

  if (scopedCids !== null) {
    const countRes = await sql`
      SELECT count(*)::int as count
      FROM applications a
      LEFT JOIN resumes r ON a.resume_id = r.id
      WHERE a.client_id = ANY(${scopedCids})
      ${filterClientId ? sql`AND a.client_id = ${filterClientId}` : sql``}
      ${filterReqId ? sql`AND a.requirement_id = ${filterReqId}` : sql``}
      ${filterEmpId ? sql`AND a.employee_id = ${filterEmpId}` : sql``}
      ${filterStatus && filterStatus !== "all" ? sql`AND a.status = ${filterStatus}` : sql``}
      ${
        search
          ? sql`AND (r.candidate_name ILIKE ${`%${search}%`} OR r.company ILIKE ${`%${search}%`} OR r.role ILIKE ${`%${search}%`})`
          : sql``
      }
    `;
    totalCount = countRes[0]?.count || 0;

    apps = await sql`
      SELECT a.*
      FROM applications a
      LEFT JOIN resumes r ON a.resume_id = r.id
      WHERE a.client_id = ANY(${scopedCids})
      ${filterClientId ? sql`AND a.client_id = ${filterClientId}` : sql``}
      ${filterReqId ? sql`AND a.requirement_id = ${filterReqId}` : sql``}
      ${filterEmpId ? sql`AND a.employee_id = ${filterEmpId}` : sql``}
      ${filterStatus && filterStatus !== "all" ? sql`AND a.status = ${filterStatus}` : sql``}
      ${
        search
          ? sql`AND (r.candidate_name ILIKE ${`%${search}%`} OR r.company ILIKE ${`%${search}%`} OR r.role ILIKE ${`%${search}%`})`
          : sql``
      }
      ORDER BY a.applied_date DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
  } else {
    const countRes = await sql`
      SELECT count(*)::int as count
      FROM applications a
      LEFT JOIN resumes r ON a.resume_id = r.id
      WHERE 1=1
      ${filterClientId ? sql`AND a.client_id = ${filterClientId}` : sql``}
      ${filterReqId ? sql`AND a.requirement_id = ${filterReqId}` : sql``}
      ${filterEmpId ? sql`AND a.employee_id = ${filterEmpId}` : sql``}
      ${filterStatus && filterStatus !== "all" ? sql`AND a.status = ${filterStatus}` : sql``}
      ${
        search
          ? sql`AND (r.candidate_name ILIKE ${`%${search}%`} OR r.company ILIKE ${`%${search}%`} OR r.role ILIKE ${`%${search}%`})`
          : sql``
      }
    `;
    totalCount = countRes[0]?.count || 0;

    apps = await sql`
      SELECT a.*
      FROM applications a
      LEFT JOIN resumes r ON a.resume_id = r.id
      WHERE 1=1
      ${filterClientId ? sql`AND a.client_id = ${filterClientId}` : sql``}
      ${filterReqId ? sql`AND a.requirement_id = ${filterReqId}` : sql``}
      ${filterEmpId ? sql`AND a.employee_id = ${filterEmpId}` : sql``}
      ${filterStatus && filterStatus !== "all" ? sql`AND a.status = ${filterStatus}` : sql``}
      ${
        search
          ? sql`AND (r.candidate_name ILIKE ${`%${search}%`} OR r.company ILIKE ${`%${search}%`} OR r.role ILIKE ${`%${search}%`})`
          : sql``
      }
      ORDER BY a.applied_date DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `;
  }

  const enriched = await enrichApplications(sql, apps);
  return c.json({
    items: enriched,
    total: totalCount,
    page,
    page_size: pageSize,
  });
});

/**
 * 2. GET /api/applications/stats (Pipeline Stage Breakdown)
 */
applicationsRouter.get("/stats", async (c) => {
  const user = c.get("user");
  const filterClientId = c.req.query("client_id");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedCids = await getScopedClientIdsForApps(sql, user);
  if (scopedCids !== null && scopedCids.length === 0) {
    return c.json({ total: 0, submitted: 0, interview: 0, offer: 0, rejected: 0, hold: 0, closed: 0 });
  }

  let statusRows: any[];
  if (scopedCids !== null) {
    statusRows = await sql`
      SELECT status, count(*)::int as count
      FROM applications
      WHERE client_id = ANY(${scopedCids})
      ${filterClientId ? sql`AND client_id = ${filterClientId}` : sql``}
      GROUP BY status
    `;
  } else {
    statusRows = await sql`
      SELECT status, count(*)::int as count
      FROM applications
      WHERE 1=1
      ${filterClientId ? sql`AND client_id = ${filterClientId}` : sql``}
      GROUP BY status
    `;
  }

  const stats: Record<string, number> = {
    total: 0,
    submitted: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
    hold: 0,
    closed: 0,
  };

  for (const row of statusRows) {
    const s = String(row.status || "").toLowerCase();
    const cnt = Number(row.count) || 0;
    stats.total += cnt;

    if (s.includes("submit") || s === "applied") stats.submitted += cnt;
    else if (s.includes("interview") || s.includes("round") || s.includes("technical")) stats.interview += cnt;
    else if (s.includes("offer") || s.includes("hired") || s.includes("placed")) stats.offer += cnt;
    else if (s.includes("reject")) stats.rejected += cnt;
    else if (s.includes("hold")) stats.hold += cnt;
    else if (s.includes("close") || s.includes("archive")) stats.closed += cnt;
    else stats.submitted += cnt;
  }

  return c.json(stats);
});

/**
 * 3. GET /api/applications/:app_id/timeline
 */
applicationsRouter.get("/:app_id/timeline", async (c) => {
  const appId = c.req.param("app_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`SELECT * FROM applications WHERE id = ${appId} LIMIT 1`;
  if (!rows || rows.length === 0) {
    return c.json({ detail: "Application not found" }, 404);
  }
  const app = rows[0];

  const scopedCids = await getScopedClientIdsForApps(sql, user);
  if (scopedCids !== null && !scopedCids.includes(String(app.client_id))) {
    return c.json({ detail: "Application not found or outside management scope" }, 404);
  }

  const [enriched] = await enrichApplications(sql, rows);

  return c.json({
    application_id: app.id,
    candidate_name: enriched.candidate_name,
    company: enriched.company,
    role: enriched.role,
    current_status: app.status,
    current_round: app.current_round || "Initial Application",
    client_name: enriched.client_name,
    events: enriched.events,
  });
});

/**
 * 4. POST /api/applications (Create direct application)
 */
applicationsRouter.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = ApplicationCreateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  const sql = getDb(c.env.DATABASE_URL);

  // Fetch Resume
  const resumes = await sql`SELECT * FROM resumes WHERE id = ${payload.resume_id} LIMIT 1`;
  if (!resumes || resumes.length === 0) {
    return c.json({ detail: "Resume not found" }, 404);
  }
  const resume = resumes[0];

  const effectiveClientId = payload.client_id || resume.client_id;
  const appId = crypto.randomUUID();

  const [created] = await sql`
    INSERT INTO applications (
      id, resume_id, client_id, requirement_id, employee_id,
      status, current_round, applied_date, updated_at
    ) VALUES (
      ${appId}, ${payload.resume_id}, ${effectiveClientId}, ${payload.requirement_id || null},
      ${user.id}, ${payload.status || "Submitted"}, ${payload.current_round || "Initial Application"},
      NOW(), NOW()
    )
    RETURNING *
  `;

  // Create initial Application Event
  await sql`
    INSERT INTO application_events (
      id, application_id, event_type, round_name, event_date, created_by_id, created_at
    ) VALUES (
      ${crypto.randomUUID()}, ${appId}, 'application_created',
      ${payload.current_round || "Initial Application"}, NOW(), ${user.id}, NOW()
    )
  `;

  // Activity Log
  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'application_created',
      ${JSON.stringify({ application_id: appId, candidate: resume.candidate_name, company: resume.company })}, NOW()
    )
  `;

  const [enriched] = await enrichApplications(sql, [created]);
  return c.json(enriched, 201);
});

/**
 * 5. PATCH / PUT /api/applications/:app_id/status
 */
const updateStatusHandler = async (c: any) => {
  const appId = c.req.param("app_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = ApplicationStatusUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`SELECT * FROM applications WHERE id = ${appId} LIMIT 1`;
  if (!rows || rows.length === 0) {
    return c.json({ detail: "Application not found" }, 404);
  }

  const currentRound = payload.current_round !== undefined ? payload.current_round : rows[0].current_round;

  const [updated] = await sql`
    UPDATE applications SET
      status = ${payload.status},
      current_round = ${currentRound},
      updated_at = NOW()
    WHERE id = ${appId}
    RETURNING *
  `;

  // Record Timeline Event
  await sql`
    INSERT INTO application_events (
      id, application_id, event_type, round_name, event_date, created_by_id, created_at
    ) VALUES (
      ${crypto.randomUUID()}, ${appId}, 'status_updated',
      ${payload.status}, NOW(), ${user.id}, NOW()
    )
  `;

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'application_status_updated',
      ${JSON.stringify({ application_id: appId, status: payload.status, round: currentRound })}, NOW()
    )
  `;

  return c.json({ message: "Status updated successfully", status: updated.status });
};

applicationsRouter.patch("/:app_id/status", updateStatusHandler);
applicationsRouter.put("/:app_id/status", updateStatusHandler);

/**
 * 6. PATCH / PUT /api/applications/:app_id/notes
 */
const updateNotesHandler = async (c: any) => {
  const appId = c.req.param("app_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = ApplicationNotesUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`SELECT id FROM applications WHERE id = ${appId} LIMIT 1`;
  if (!rows || rows.length === 0) {
    return c.json({ detail: "Application not found" }, 404);
  }

  await sql`
    UPDATE applications SET
      client_notes = ${payload.client_notes || null},
      is_note_shared = ${payload.is_note_shared},
      updated_at = NOW()
    WHERE id = ${appId}
  `;

  return c.json({ message: "Notes updated successfully" });
};

applicationsRouter.patch("/:app_id/notes", updateNotesHandler);
applicationsRouter.put("/:app_id/notes", updateNotesHandler);

/**
 * 7. POST /api/applications/:app_id/close
 */
applicationsRouter.post("/:app_id/close", async (c) => {
  const appId = c.req.param("app_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const [updated] = await sql`
    UPDATE applications SET status = 'Closed', updated_at = NOW()
    WHERE id = ${appId}
    RETURNING id
  `;

  if (!updated) {
    return c.json({ detail: "Application not found" }, 404);
  }

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (${crypto.randomUUID()}, ${user.id}, 'application_closed', ${JSON.stringify({ application_id: appId })}, NOW())
  `;

  return c.json({ message: "Application closed successfully" });
});

/**
 * 8. POST /api/applications/:app_id/archive
 */
applicationsRouter.post("/:app_id/archive", async (c) => {
  const appId = c.req.param("app_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const [updated] = await sql`
    UPDATE applications SET status = 'Archived', updated_at = NOW()
    WHERE id = ${appId}
    RETURNING id
  `;

  if (!updated) {
    return c.json({ detail: "Application not found" }, 404);
  }

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (${crypto.randomUUID()}, ${user.id}, 'application_archived', ${JSON.stringify({ application_id: appId })}, NOW())
  `;

  return c.json({ message: "Application archived successfully" });
});

/**
 * 9. DELETE /api/applications/:app_id (Super Admin only)
 */
applicationsRouter.delete("/:app_id", requireRoles("super_admin"), async (c) => {
  const appId = c.req.param("app_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`SELECT id FROM applications WHERE id = ${appId} LIMIT 1`;
  if (!rows || rows.length === 0) {
    return c.json({ detail: "Application not found" }, 404);
  }

  await sql`DELETE FROM application_events WHERE application_id = ${appId}`;
  await sql`DELETE FROM applications WHERE id = ${appId}`;

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (${crypto.randomUUID()}, ${user.id}, 'application_deleted', ${JSON.stringify({ application_id: appId })}, NOW())
  `;

  return c.json({ message: "Application deleted successfully" });
});
