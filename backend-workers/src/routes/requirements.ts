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

  // Pre-fetch active employees assigned to clients
  const clientEmployeesMap: Record<string, { ids: string[]; names: string[] }> = {};
  if (clientIds.length > 0) {
    const clientEmps = await sql`
      SELECT ec.client_id, u.id as employee_id, u.name as employee_name
      FROM employee_clients ec
      JOIN users u ON u.id = ec.employee_id
      WHERE ec.client_id = ANY(${clientIds})
        AND ec.active = true
        AND u.is_active = true
      ORDER BY u.name ASC
    `;
    for (const row of clientEmps) {
      const cid = String(row.client_id);
      if (!clientEmployeesMap[cid]) {
        clientEmployeesMap[cid] = { ids: [], names: [] };
      }
      clientEmployeesMap[cid].ids.push(String(row.employee_id));
      clientEmployeesMap[cid].names.push(String(row.employee_name));
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
    const cid = r.client_id ? String(r.client_id) : "";
    const clientAssigned = cid && clientEmployeesMap[cid] ? clientEmployeesMap[cid] : null;

    let assignedEmployee: string | string[] = "ALL";
    let assignedEmployeeNames: string[] = [];

    if (r.client_id) {
      if (clientAssigned && clientAssigned.ids.length > 0) {
        assignedEmployee = clientAssigned.ids;
        assignedEmployeeNames = clientAssigned.names;
      } else if (r.assigned_employee_id && userMap[String(r.assigned_employee_id)]) {
        assignedEmployee = [String(r.assigned_employee_id)];
        assignedEmployeeNames = [userMap[String(r.assigned_employee_id)]];
      } else {
        assignedEmployee = [];
        assignedEmployeeNames = [];
      }
    } else {
      assignedEmployee = "ALL";
      assignedEmployeeNames = [];
    }

    const assignedEmployeeNameDisplay = assignedEmployeeNames.length > 0
      ? assignedEmployeeNames.join(", ")
      : (r.client_id ? "No assigned employees" : "All Employees");

    return {
      id: r.id,
      client_id: r.client_id || null,
      client_name: r.client_id ? (clientMap[cid] || r.company || "") : "Global for All",
      company: r.company,
      job_title: r.job_title || r.role || "Open Role",
      role: r.role || r.job_title || "Open Role",
      role_code: r.role_code,
      job_url: r.job_url || null,
      priority: r.priority || "Medium",
      notes: r.notes || null,
      status: r.status || "active",
      assignment_type: r.assignment_type || (r.client_id && assignedEmployeeNames.length ? "client_assigned" : "all"),
      assigned_employee: assignedEmployee,
      assigned_employee_names: assignedEmployeeNames,
      assigned_employee_id: r.assigned_employee_id || (clientAssigned?.ids[0] || null),
      assigned_employee_name: assignedEmployeeNameDisplay,
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
    if (user.role === "client") {
      conditions.push(`client_id = ANY($${pIdx++})`);
      params.push(scopedCids);
    } else {
      // Employees, recruiters, and sub_admins view scoped clients + global requirements
      conditions.push(`(client_id IS NULL OR client_id = ANY($${pIdx++}))`);
      params.push(scopedCids);
    }
  }
  if (filterClientId) {
    if (filterClientId === "global" || filterClientId === "ALL") {
      conditions.push(`client_id IS NULL`);
    } else if (filterClientId !== "all") {
      conditions.push(`client_id = $${pIdx++}`);
      params.push(filterClientId);
    }
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
  if (scopedCids !== null && user.role === "client" && !scopedCids.includes(String(req.client_id))) {
    return c.json({ detail: "Job opening not found" }, 404);
  }
  if (scopedCids !== null && req.client_id !== null && !scopedCids.includes(String(req.client_id))) {
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

  // Derive client_id: 'global', 'ALL', or null saves as a single global requirement
  let effectiveClientId: string | null = null;
  if (payload.client_id === "global" || payload.client_id === "ALL" || payload.client_id === null) {
    effectiveClientId = null;
  } else if (payload.client_id) {
    effectiveClientId = payload.client_id;
  } else if (user.role === "client") {
    effectiveClientId = user.client_id || null;
  } else {
    effectiveClientId = null;
  }

  // Populate titles
  const jobTitle = payload.job_title || payload.role || "Open Role";
  const role = payload.role || payload.job_title || "Open Role";

  let assignmentType = "all";
  let assignedEmployeeId: string | null = null;

  if (!effectiveClientId) {
    // Global for All: Store client_id = NULL, assigned_employee = "ALL"
    assignmentType = "all";
    assignedEmployeeId = null;
  } else {
    // Real client selected: Query active employees assigned to that client
    const assignedEmps = await sql`
      SELECT u.id, u.name
      FROM users u
      JOIN employee_clients ec ON ec.employee_id = u.id
      WHERE ec.client_id = ${effectiveClientId}
        AND ec.active = true
        AND u.is_active = true
      ORDER BY u.name ASC
    `;
    if (assignedEmps.length > 0) {
      assignmentType = "client_assigned";
      assignedEmployeeId = assignedEmps[0].id;
    } else {
      assignmentType = "client_assigned";
      assignedEmployeeId = null;
    }
  }

  // Generate role_code
  let roleCode = payload.role_code;
  if (!roleCode) {
    const prefix = payload.company.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() || "JOB";
    const rolePart = jobTitle.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "ROLE";
    roleCode = `${prefix}-${rolePart}-01`;
  }

  const reqId = crypto.randomUUID();

  const [created] = await sql`
    INSERT INTO requirements (
      id, client_id, company, job_title, role, role_code, job_url,
      priority, notes, status, assignment_type, assigned_employee_id,
      created_by, created_at
    ) VALUES (
      ${reqId}, ${effectiveClientId}, ${payload.company}, ${jobTitle}, ${role},
      ${roleCode}, ${payload.job_url || null}, ${payload.priority || "Medium"},
      ${payload.notes || null}, ${payload.status || "active"}, ${assignmentType},
      ${assignedEmployeeId}, ${user.id}, NOW()
    )
    RETURNING *
  `;

  // Activity Log
  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'requirement_created',
      ${JSON.stringify({ requirement_id: reqId, role_code: roleCode, company: payload.company, client_id: effectiveClientId })}, NOW()
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
  if (scopedCids !== null && user.role === "client" && !scopedCids.includes(String(current.client_id))) {
    return c.json({ detail: "Job opening not found" }, 404);
  }
  if (scopedCids !== null && current.client_id !== null && !scopedCids.includes(String(current.client_id))) {
    return c.json({ detail: "Job opening not found" }, 404);
  }

  let clientIdVal = current.client_id;
  if (payload.client_id !== undefined) {
    if (payload.client_id === "global" || payload.client_id === "ALL" || payload.client_id === null) {
      clientIdVal = null;
    } else {
      clientIdVal = payload.client_id;
    }
  }

  const companyVal = payload.company !== undefined ? payload.company : current.company;
  const jobTitleVal = payload.job_title !== undefined ? payload.job_title : current.job_title;
  const roleVal = payload.role !== undefined ? payload.role : current.role;
  const roleCodeVal = payload.role_code !== undefined ? payload.role_code : current.role_code;
  const jobUrlVal = payload.job_url !== undefined ? payload.job_url : current.job_url;
  const priorityVal = payload.priority !== undefined ? payload.priority : current.priority;
  const notesVal = payload.notes !== undefined ? payload.notes : current.notes;
  const statusVal = payload.status !== undefined ? payload.status : current.status;
  let assignTypeVal = payload.assignment_type !== undefined ? payload.assignment_type : current.assignment_type;
  let assignEmpIdVal =
    payload.assigned_employee_id !== undefined ? payload.assigned_employee_id : current.assigned_employee_id;

  if (payload.client_id !== undefined) {
    if (!clientIdVal) {
      assignTypeVal = "all";
      assignEmpIdVal = null;
    } else {
      const assignedEmps = await sql`
        SELECT u.id, u.name
        FROM users u
        JOIN employee_clients ec ON ec.employee_id = u.id
        WHERE ec.client_id = ${clientIdVal}
          AND ec.active = true
          AND u.is_active = true
        ORDER BY u.name ASC
      `;
      if (assignedEmps.length > 0) {
        assignTypeVal = "client_assigned";
        assignEmpIdVal = assignedEmps[0].id;
      } else {
        assignTypeVal = "client_assigned";
        assignEmpIdVal = null;
      }
    }
  }

  const [updated] = await sql`
    UPDATE requirements SET
      client_id = ${clientIdVal},
      company = ${companyVal},
      job_title = ${jobTitleVal},
      role = ${roleVal},
      role_code = ${roleCodeVal},
      job_url = ${jobUrlVal},
      priority = ${priorityVal},
      notes = ${notesVal},
      status = ${statusVal},
      assignment_type = ${assignTypeVal},
      assigned_employee_id = ${assignEmpIdVal}
    WHERE id = ${reqId}
    RETURNING *
  `;

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'requirement_updated',
      ${JSON.stringify({ requirement_id: reqId, role_code: roleCodeVal, client_id: clientIdVal })}, NOW()
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
      completed_at = NOW()
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
      completed_at = NULL
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
      status = 'archived'
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
