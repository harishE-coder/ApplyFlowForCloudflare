/**
 * Requirements (Job Openings) Router for Cloudflare Workers (Hono).
 * Full feature and API parity with FastAPI app.modules.requirements.router.
 */

import { Hono } from "hono";
import { getDb } from "../db";
import { requireAuth } from "../middleware/auth";
import {
  RequirementCreateSchema,
  RequirementUpdateSchema,
} from "../schemas/requirements";
import type { Bindings, UserPayload, Variables } from "../types";

export const requirementsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All requirement endpoints require authentication
requirementsRouter.use("*", requireAuth);

/**
 * Helper: Resolve permitted client IDs for scoping requirements
 */
async function getScopedClientIdsForReqs(sql: any, user: UserPayload): Promise<string[] | null> {
  if (user.role === "super_admin" || user.role === "admin") {
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
 * Helper: Enriched Requirement Response with names and counts
 */
async function enrichRequirements(sql: any, reqs: any[]): Promise<any[]> {
  if (!reqs || reqs.length === 0) return [];

  const reqIds = reqs.map((r) => r.id).filter(Boolean).map(String);
  const clientIds = [...new Set(reqs.map((r) => r.client_id).filter(Boolean).map(String))];
  const userIds = [
    ...new Set(
      reqs
        .flatMap((r) => [r.created_by, r.completed_by, r.assigned_employee_id])
        .filter(Boolean)
        .map(String)
    ),
  ];

  // Pre-fetch client company names
  const clientMap: Record<string, string> = {};
  if (clientIds.length > 0) {
    const clients = await sql`SELECT id, company_name FROM clients WHERE id = ANY(${clientIds})`;
    for (const c of clients) {
      clientMap[String(c.id)] = c.company_name;
    }
  }

  // Pre-fetch user names
  const userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const users = await sql`SELECT id, name FROM users WHERE id = ANY(${userIds})`;
    for (const u of users) {
      userMap[String(u.id)] = u.name;
    }
  }

  // Pre-fetch counts for resumes and applications
  const [resumesRes, appsRes] = await Promise.all([
    sql`
      SELECT requirement_id, count(*)::int as count
      FROM resumes
      WHERE requirement_id = ANY(${reqIds})
      GROUP BY requirement_id
    `,
    sql`
      SELECT requirement_id, count(*)::int as count
      FROM applications
      WHERE requirement_id = ANY(${reqIds})
      GROUP BY requirement_id
    `,
  ]);

  const resumesMap = Object.fromEntries(resumesRes.map((r: any) => [String(r.requirement_id), Number(r.count)]));
  const appsMap = Object.fromEntries(appsRes.map((r: any) => [String(r.requirement_id), Number(r.count)]));

  return reqs.map((r) => {
    const rid = String(r.id);
    const cid = String(r.client_id);
    return {
      id: r.id,
      client_id: r.client_id,
      client_name: clientMap[cid] || r.company || "",
      company: r.company,
      job_title: r.job_title || r.role || "Open Role",
      role: r.role || r.job_title || "Open Role",
      role_code: r.role_code,
      job_url: r.job_url || null,
      priority: r.priority || "Medium",
      notes: r.notes || null,
      status: r.status || "active",
      assignment_type: r.assignment_type || "all",
      assigned_employee_id: r.assigned_employee_id || null,
      assigned_employee_name: r.assigned_employee_id ? userMap[String(r.assigned_employee_id)] || null : null,
      created_by: r.created_by || null,
      creator_name: r.created_by ? userMap[String(r.created_by)] || null : null,
      completed_by: r.completed_by || null,
      completer_name: r.completed_by ? userMap[String(r.completed_by)] || null : null,
      created_at: r.created_at,
      completed_at: r.completed_at || null,
      total_resumes: resumesMap[rid] || 0,
      total_applications: appsMap[rid] || 0,
    };
  });
}

/**
 * 1. GET /api/requirements (List Job Openings)
 */
requirementsRouter.get("/", async (c) => {
  const user = c.get("user");
  const filterClientId = c.req.query("client_id");
  const filterStatus = c.req.query("status");
  const filterPriority = c.req.query("priority");
  const search = c.req.query("search");

  const sql = getDb(c.env.DATABASE_URL);

  const scopedCids = await getScopedClientIdsForReqs(sql, user);
  if (scopedCids !== null && scopedCids.length === 0) {
    return c.json([]);
  }

  const conditions: string[] = [];
  const params: any[] = [];
  let pIdx = 1;

  if (scopedCids !== null) {
    conditions.push(`client_id = ANY($${pIdx++})`);
    params.push(scopedCids);
  }
  if (filterClientId) {
    conditions.push(`client_id = $${pIdx++}`);
    params.push(filterClientId);
  }
  if (filterStatus && filterStatus !== "all") {
    conditions.push(`status = $${pIdx++}`);
    params.push(filterStatus);
  }
  if (filterPriority) {
    conditions.push(`priority = $${pIdx++}`);
    params.push(filterPriority);
  }
  if (search) {
    conditions.push(`(company ILIKE $${pIdx} OR role ILIKE $${pIdx} OR role_code ILIKE $${pIdx})`);
    params.push(`%${search}%`);
    pIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const queryStr = `
    SELECT * FROM requirements
    ${whereClause}
    ORDER BY created_at DESC
  `;
  const rows = await (sql as any)(queryStr, params);

  const enriched = await enrichRequirements(sql, rows);
  return c.json(enriched);
});

/**
 * 2. GET /api/requirements/:req_id
 */
requirementsRouter.get("/:req_id", async (c) => {
  const reqId = c.req.param("req_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`SELECT * FROM requirements WHERE id = ${reqId} LIMIT 1`;
  if (!rows || rows.length === 0) {
    return c.json({ detail: "Job opening not found" }, 404);
  }

  const req = rows[0];
  const scopedCids = await getScopedClientIdsForReqs(sql, user);
  if (scopedCids !== null && !scopedCids.includes(String(req.client_id))) {
    return c.json({ detail: "Job opening not found" }, 404);
  }

  const [enriched] = await enrichRequirements(sql, rows);
  return c.json(enriched);
});

/**
 * 3. POST /api/requirements (Admin, Sub-Admin, or Client; Employee blocked)
 */
requirementsRouter.post("/", async (c) => {
  const user = c.get("user");
  if (user.role === "employee" || user.role === "recruiter") {
    return c.json({ detail: "Recruiters cannot create job openings." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parseResult = RequirementCreateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  const sql = getDb(c.env.DATABASE_URL);

  // Derive client_id
  let effectiveClientId = payload.client_id;
  if (user.role === "client") {
    effectiveClientId = user.client_id || undefined;
  }

  // Populate titles
  const jobTitle = payload.job_title || payload.role || "Open Role";
  const role = payload.role || payload.job_title || "Open Role";

  let assignmentType = payload.assignment_type || "all";
  let assignedEmployeeId = payload.assigned_employee_id || null;
  if (payload.assigned_employee === "ALL" || !payload.assigned_employee_id) {
    assignmentType = "all";
    assignedEmployeeId = null;
  } else {
    assignmentType = "individual";
  }

  // Helper to generate role_code
  const getRoleCode = (idx?: number) => {
    if (payload.role_code && idx === undefined) return payload.role_code;
    const prefix = payload.company.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() || "JOB";
    const rolePart = jobTitle.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "ROLE";
    const num = idx !== undefined ? String(idx).padStart(2, "0") : "01";
    return `${prefix}-${rolePart}-${num}`;
  };

  // Handle Global (All Service Clients at once)
  if (effectiveClientId === "ALL" || effectiveClientId === "GLOBAL") {
    const scopedCids = await getScopedClientIdsForReqs(sql, user);
    let targetClients: any[] = [];
    if (scopedCids !== null) {
      if (scopedCids.length === 0) {
        return c.json({ detail: "No accessible service clients found." }, 400);
      }
      targetClients = await sql`
        SELECT id, company_name FROM clients 
        WHERE id = ANY(${scopedCids}) AND is_active = true
        ORDER BY company_name ASC
      `;
    } else {
      targetClients = await sql`
        SELECT id, company_name FROM clients 
        WHERE is_active = true
        ORDER BY company_name ASC
      `;
    }

    if (targetClients.length === 0) {
      targetClients = await sql`SELECT id, company_name FROM clients ORDER BY company_name ASC LIMIT 50`;
    }

    if (targetClients.length === 0) {
      return c.json({ detail: "No clients found to create job openings for." }, 400);
    }

    const createdList: any[] = [];
    let idx = 1;
    for (const cl of targetClients) {
      const reqId = crypto.randomUUID();
      const roleCode = getRoleCode(idx++);
      const [cr] = await sql`
        INSERT INTO requirements (
          id, client_id, company, job_title, role, role_code, job_url,
          priority, notes, status, assignment_type, assigned_employee_id,
          created_by, created_at, updated_at
        ) VALUES (
          ${reqId}, ${cl.id}, ${payload.company}, ${jobTitle}, ${role},
          ${roleCode}, ${payload.job_url || null}, ${payload.priority || "Medium"},
          ${payload.notes || null}, ${payload.status || "active"}, ${assignmentType},
          ${assignedEmployeeId}, ${user.id}, NOW(), NOW()
        )
        RETURNING *
      `;
      createdList.push(cr);

      await sql`
        INSERT INTO activity_logs (id, user_id, action, details, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${user.id}, 'requirement_created',
          ${JSON.stringify({ requirement_id: reqId, role_code: roleCode, company: payload.company, client_id: cl.id })}, NOW()
        )
      `;
    }

    const enriched = await enrichRequirements(sql, createdList);
    return c.json(enriched[0] || {}, 201);
  }

  if (!effectiveClientId) {
    // If client_id omitted, match by company name
    const clientMatch = await sql`
      SELECT id FROM clients WHERE LOWER(company_name) = ${payload.company.trim().toLowerCase()} LIMIT 1
    `;
    if (clientMatch.length > 0) {
      effectiveClientId = clientMatch[0].id;
    } else {
      return c.json({ detail: "client_id is required or must match an existing client." }, 400);
    }
  }

  const roleCode = getRoleCode();

  const reqId = crypto.randomUUID();

  const [created] = await sql`
    INSERT INTO requirements (
      id, client_id, company, job_title, role, role_code, job_url,
      priority, notes, status, assignment_type, assigned_employee_id,
      created_by, created_at, updated_at
    ) VALUES (
      ${reqId}, ${effectiveClientId}, ${payload.company}, ${jobTitle}, ${role},
      ${roleCode}, ${payload.job_url || null}, ${payload.priority || "Medium"},
      ${payload.notes || null}, ${payload.status || "active"}, ${assignmentType},
      ${assignedEmployeeId}, ${user.id}, NOW(), NOW()
    )
    RETURNING *
  `;

  // Activity Log
  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'requirement_created',
      ${JSON.stringify({ requirement_id: reqId, role_code: roleCode, company: payload.company })}, NOW()
    )
  `;

  const [enriched] = await enrichRequirements(sql, [created]);
  return c.json(enriched, 201);
});

/**
 * 4. PUT / PATCH /api/requirements/:req_id
 */
const updateRequirementHandler = async (c: any) => {
  const reqId = c.req.param("req_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = RequirementUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`SELECT * FROM requirements WHERE id = ${reqId} LIMIT 1`;
  if (!rows || rows.length === 0) {
    return c.json({ detail: "Job opening not found" }, 404);
  }
  const current = rows[0];

  const scopedCids = await getScopedClientIdsForReqs(sql, user);
  if (scopedCids !== null && !scopedCids.includes(String(current.client_id))) {
    return c.json({ detail: "Job opening not found" }, 404);
  }

  const companyVal = payload.company !== undefined ? payload.company : current.company;
  const jobTitleVal = payload.job_title !== undefined ? payload.job_title : current.job_title;
  const roleVal = payload.role !== undefined ? payload.role : current.role;
  const roleCodeVal = payload.role_code !== undefined ? payload.role_code : current.role_code;
  const jobUrlVal = payload.job_url !== undefined ? payload.job_url : current.job_url;
  const priorityVal = payload.priority !== undefined ? payload.priority : current.priority;
  const notesVal = payload.notes !== undefined ? payload.notes : current.notes;
  const statusVal = payload.status !== undefined ? payload.status : current.status;
  const assignTypeVal = payload.assignment_type !== undefined ? payload.assignment_type : current.assignment_type;
  const assignEmpIdVal =
    payload.assigned_employee_id !== undefined ? payload.assigned_employee_id : current.assigned_employee_id;

  const [updated] = await sql`
    UPDATE requirements SET
      company = ${companyVal},
      job_title = ${jobTitleVal},
      role = ${roleVal},
      role_code = ${roleCodeVal},
      job_url = ${jobUrlVal},
      priority = ${priorityVal},
      notes = ${notesVal},
      status = ${statusVal},
      assignment_type = ${assignTypeVal},
      assigned_employee_id = ${assignEmpIdVal},
      updated_at = NOW()
    WHERE id = ${reqId}
    RETURNING *
  `;

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'requirement_updated',
      ${JSON.stringify({ requirement_id: reqId, role_code: roleCodeVal })}, NOW()
    )
  `;

  const [enriched] = await enrichRequirements(sql, [updated]);
  return c.json(enriched);
};

requirementsRouter.put("/:req_id", updateRequirementHandler);
requirementsRouter.patch("/:req_id", updateRequirementHandler);

/**
 * 5. POST /api/requirements/:req_id/done & /complete & /close
 */
const markDoneHandler = async (c: any) => {
  const reqId = c.req.param("req_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`SELECT * FROM requirements WHERE id = ${reqId} LIMIT 1`;
  if (!rows || rows.length === 0) {
    return c.json({ detail: "Job opening not found" }, 404);
  }

  const [updated] = await sql`
    UPDATE requirements SET
      status = 'done',
      completed_by = ${user.id},
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${reqId}
    RETURNING *
  `;

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'requirement_completed',
      ${JSON.stringify({ requirement_id: reqId, completed_by: user.name })}, NOW()
    )
  `;

  const [enriched] = await enrichRequirements(sql, [updated]);
  return c.json(enriched);
};

requirementsRouter.post("/:req_id/done", markDoneHandler);
requirementsRouter.post("/:req_id/complete", markDoneHandler);
requirementsRouter.post("/:req_id/close", markDoneHandler);

/**
 * 6. POST /api/requirements/:req_id/reopen
 */
requirementsRouter.post("/:req_id/reopen", async (c) => {
  const reqId = c.req.param("req_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const [updated] = await sql`
    UPDATE requirements SET
      status = 'active',
      completed_by = NULL,
      completed_at = NULL,
      updated_at = NOW()
    WHERE id = ${reqId}
    RETURNING id
  `;

  if (!updated) {
    return c.json({ detail: "Job opening not found" }, 404);
  }

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (${crypto.randomUUID()}, ${user.id}, 'requirement_reopened', ${JSON.stringify({ requirement_id: reqId })}, NOW())
  `;

  return c.json({ message: "Job opening reopened successfully" });
});

/**
 * 7. POST /api/requirements/:req_id/archive
 */
requirementsRouter.post("/:req_id/archive", async (c) => {
  const reqId = c.req.param("req_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const [updated] = await sql`
    UPDATE requirements SET
      status = 'archived',
      updated_at = NOW()
    WHERE id = ${reqId}
    RETURNING id
  `;

  if (!updated) {
    return c.json({ detail: "Job opening not found" }, 404);
  }

  return c.json({ message: "Job opening archived successfully" });
});

/**
 * 8. DELETE /api/requirements/:req_id (Safe delete)
 */
requirementsRouter.delete("/:req_id", async (c) => {
  const reqId = c.req.param("req_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`SELECT * FROM requirements WHERE id = ${reqId} LIMIT 1`;
  if (!rows || rows.length === 0) {
    return c.json({ detail: "Job opening not found" }, 404);
  }
  const req = rows[0];

  const [resumes, apps] = await Promise.all([
    sql`SELECT count(*)::int as count FROM resumes WHERE requirement_id = ${reqId}`,
    sql`SELECT count(*)::int as count FROM applications WHERE requirement_id = ${reqId}`,
  ]);

  const reasons: string[] = [];
  if (resumes[0]?.count > 0) reasons.push(`${resumes[0].count} resume(s)`);
  if (apps[0]?.count > 0) reasons.push(`${apps[0].count} application(s)`);

  if (reasons.length > 0) {
    return c.json(
      {
        detail: `Job opening '${req.role_code}' cannot be deleted because ${reasons.join(
          ", "
        )} are linked. Archive the opening instead.`,
      },
      400
    );
  }

  await sql`DELETE FROM requirements WHERE id = ${reqId}`;

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'requirement_deleted',
      ${JSON.stringify({ requirement_id: reqId, role_code: req.role_code })}, NOW()
    )
  `;

  return c.json({ message: "Job opening deleted successfully" });
});
