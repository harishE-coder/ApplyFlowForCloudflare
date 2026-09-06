/**
 * Employees and Users Router for Cloudflare Workers (Hono).
 * Full feature and API parity with FastAPI app.modules.users.router.
 */

import { Hono } from "hono";
import { hashPassword } from "../auth";
import { getDb } from "../db";
import { requireAuth, requireRoles } from "../middleware/auth";
import {
  ResetPasswordSchema,
  UserCreateSchema,
  UserUpdateSchema,
} from "../schemas/employees";
import type { Bindings, UserPayload, Variables } from "../types";

export const employeesRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All employee and user endpoints require authentication
employeesRouter.use("*", requireAuth);

/**
 * Helper: Resolve permitted employee IDs based on role
 */
async function getScopedEmployeeIds(sql: any, user: UserPayload): Promise<string[] | null> {
  if (user.role === "super_admin") {
    return null; // Global access
  }

  if (user.role === "sub_admin") {
    const assigned = await sql`
      SELECT employee_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true AND employee_id IS NOT NULL
      UNION
      SELECT id as employee_id FROM users WHERE managed_by = ${user.id}
    `;
    return assigned.map((r: any) => String(r.employee_id));
  }

  return [user.id];
}

/**
 * Helper: Pre-fetch assigned clients for users
 */
async function fetchUserAssignedClients(sql: any, userIds: string[]): Promise<Record<string, any[]>> {
  if (!userIds || userIds.length === 0) return {};

  const rows = await sql`
    SELECT ec.employee_id, c.id, c.company_name
    FROM employee_clients ec
    JOIN clients c ON ec.client_id = c.id
    WHERE ec.employee_id = ANY(${userIds}) AND ec.active = true
    ORDER BY c.company_name ASC
  `;

  const map: Record<string, any[]> = {};
  for (const r of rows) {
    const eid = String(r.employee_id);
    if (!map[eid]) map[eid] = [];
    map[eid].push({ id: r.id, company_name: r.company_name });
  }
  return map;
}

/**
 * Helper: Enriched User Detail Response
 */
async function enrichUsers(sql: any, users: any[]): Promise<any[]> {
  if (!users || users.length === 0) return [];
  const userIds = users.map((u) => String(u.id));
  const clientsMap = await fetchUserAssignedClients(sql, userIds);

  return users.map((u) => {
    const uid = String(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone || null,
      role: u.role,
      status: u.status || (u.is_active ? "active" : "inactive"),
      client_id: u.client_id || null,
      managed_by: u.managed_by || null,
      is_active: Boolean(u.is_active),
      created_at: u.created_at,
      assigned_clients: clientsMap[uid] || [],
    };
  });
}

/**
 * 1. GET /api/employees (Recruiter performance list)
 */
employeesRouter.get("/employees", requireRoles("super_admin", "sub_admin"), async (c) => {
  const user = c.get("user");
  const statusFilter = c.req.query("status");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedEids = await getScopedEmployeeIds(sql, user);
  if (scopedEids !== null && scopedEids.length === 0) {
    return c.json([]);
  }

  let empRows: any[];
  if (scopedEids !== null) {
    if (statusFilter && statusFilter !== "all") {
      empRows = await sql`
        SELECT id, name, email, phone, status, is_active
        FROM users
        WHERE id = ANY(${scopedEids}) AND role IN ('employee', 'recruiter') AND status = ${statusFilter}
        ORDER BY name ASC
      `;
    } else if (!statusFilter) {
      empRows = await sql`
        SELECT id, name, email, phone, status, is_active
        FROM users
        WHERE id = ANY(${scopedEids}) AND role IN ('employee', 'recruiter') AND status != 'archived'
        ORDER BY name ASC
      `;
    } else {
      empRows = await sql`
        SELECT id, name, email, phone, status, is_active
        FROM users
        WHERE id = ANY(${scopedEids}) AND role IN ('employee', 'recruiter')
        ORDER BY name ASC
      `;
    }
  } else {
    if (statusFilter && statusFilter !== "all") {
      empRows = await sql`
        SELECT id, name, email, phone, status, is_active
        FROM users
        WHERE role IN ('employee', 'recruiter') AND status = ${statusFilter}
        ORDER BY name ASC
      `;
    } else if (!statusFilter) {
      empRows = await sql`
        SELECT id, name, email, phone, status, is_active
        FROM users
        WHERE role IN ('employee', 'recruiter') AND status != 'archived'
        ORDER BY name ASC
      `;
    } else {
      empRows = await sql`
        SELECT id, name, email, phone, status, is_active
        FROM users
        WHERE role IN ('employee', 'recruiter')
        ORDER BY name ASC
      `;
    }
  }

  if (empRows.length === 0) {
    return c.json([]);
  }

  const empIds = empRows.map((e) => String(e.id));
  const clientsMap = await fetchUserAssignedClients(sql, empIds);

  // Performance telemetry queries
  const [resumesTotal, resumesToday, appsTotal, appsToday, targetsSum] = await Promise.all([
    sql`
      SELECT uploaded_by as employee_id, count(*)::int as count
      FROM resumes
      WHERE uploaded_by = ANY(${empIds})
      GROUP BY uploaded_by
    `,
    sql`
      SELECT uploaded_by as employee_id, count(*)::int as count
      FROM resumes
      WHERE uploaded_by = ANY(${empIds}) AND (resume_date = CURRENT_DATE OR upload_date >= CURRENT_DATE)
      GROUP BY uploaded_by
    `,
    sql`
      SELECT employee_id, count(*)::int as count
      FROM applications
      WHERE employee_id = ANY(${empIds})
      GROUP BY employee_id
    `,
    sql`
      SELECT employee_id, count(*)::int as count
      FROM applications
      WHERE employee_id = ANY(${empIds}) AND applied_date >= CURRENT_DATE
      GROUP BY employee_id
    `,
    sql`
      SELECT employee_id, sum(daily_target)::int as sum
      FROM targets
      WHERE employee_id = ANY(${empIds}) AND status = 'active'
      GROUP BY employee_id
    `,
  ]);

  const resTotalMap = Object.fromEntries(resumesTotal.map((r: any) => [String(r.employee_id), Number(r.count)]));
  const resTodayMap = Object.fromEntries(resumesToday.map((r: any) => [String(r.employee_id), Number(r.count)]));
  const appsTotalMap = Object.fromEntries(appsTotal.map((r: any) => [String(r.employee_id), Number(r.count)]));
  const appsTodayMap = Object.fromEntries(appsToday.map((r: any) => [String(r.employee_id), Number(r.count)]));
  const targetsMap = Object.fromEntries(targetsSum.map((r: any) => [String(r.employee_id), Number(r.sum)]));

  const performanceList = empRows.map((e) => {
    const eid = String(e.id);
    const todayApps = appsTodayMap[eid] || 0;
    const dailyTarget = targetsMap[eid] || 0;
    const completionPct = dailyTarget > 0 ? Math.min(100, Math.round((todayApps / dailyTarget) * 1000) / 10) : 0.0;

    return {
      id: e.id,
      name: e.name,
      email: e.email,
      phone: e.phone || null,
      status: e.status || (e.is_active ? "active" : "inactive"),
      is_active: Boolean(e.is_active),
      assigned_clients: clientsMap[eid] || [],
      total_uploads: resTotalMap[eid] || 0,
      today_uploads: resTodayMap[eid] || 0,
      total_applications: appsTotalMap[eid] || 0,
      today_applications: todayApps,
      daily_target: dailyTarget,
      completion_percentage: completionPct,
    };
  });

  return c.json(performanceList);
});

/**
 * 2. GET /api/users (List all users with filters)
 */
employeesRouter.get("/users", requireRoles("super_admin", "sub_admin"), async (c) => {
  const user = c.get("user");
  const roleFilter = c.req.query("role");
  const statusFilter = c.req.query("status");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedEids = await getScopedEmployeeIds(sql, user);
  if (scopedEids !== null && scopedEids.length === 0) {
    return c.json([]);
  }

  let queryUsers: any[];
  if (scopedEids !== null) {
    queryUsers = await sql`
      SELECT id, name, email, phone, role, status, client_id, managed_by, is_active, created_at
      FROM users
      WHERE id = ANY(${scopedEids})
      ${roleFilter ? sql`AND role = ${roleFilter}` : sql``}
      ${statusFilter && statusFilter !== "all" ? sql`AND status = ${statusFilter}` : sql``}
      ORDER BY name ASC
    `;
  } else {
    queryUsers = await sql`
      SELECT id, name, email, phone, role, status, client_id, managed_by, is_active, created_at
      FROM users
      WHERE 1=1
      ${roleFilter ? sql`AND role = ${roleFilter}` : sql``}
      ${statusFilter && statusFilter !== "all" ? sql`AND status = ${statusFilter}` : sql``}
      ORDER BY name ASC
    `;
  }

  const enriched = await enrichUsers(sql, queryUsers);
  return c.json(enriched);
});

/**
 * 3. GET /api/employees/:user_id and GET /api/users/:user_id
 */
const getUserHandler = async (c: any) => {
  const userId = c.req.param("user_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedEids = await getScopedEmployeeIds(sql, user);
  if (scopedEids !== null && !scopedEids.includes(userId)) {
    return c.json({ detail: "User not found or outside your management scope" }, 404);
  }

  const rows = await sql`
    SELECT id, name, email, phone, role, status, client_id, managed_by, is_active, created_at
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  if (!rows || rows.length === 0) {
    return c.json({ detail: "User not found" }, 404);
  }

  const [enriched] = await enrichUsers(sql, rows);
  return c.json(enriched);
};

employeesRouter.get("/employees/:user_id", requireRoles("super_admin", "sub_admin"), getUserHandler);
employeesRouter.get("/users/:user_id", requireRoles("super_admin", "sub_admin"), getUserHandler);

/**
 * 4. POST /api/employees and POST /api/users (Create User)
 */
const createUserHandler = async (c: any) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = UserCreateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  // Sub-Admins can only create employees
  if (user.role === "sub_admin" && payload.role !== "employee" && payload.role !== "recruiter") {
    return c.json({ detail: "Sub-Admins can only create employees." }, 403);
  }

  const sql = getDb(c.env.DATABASE_URL);

  const existing = await sql`
    SELECT id FROM users WHERE LOWER(email) = ${payload.email.toLowerCase()} LIMIT 1
  `;
  if (existing.length > 0) {
    return c.json({ detail: `User with email '${payload.email}' already exists.` }, 409);
  }

  const userId = crypto.randomUUID();
  const hashedPassword = await hashPassword(payload.password);
  const managedBy = user.role === "sub_admin" ? user.id : null;

  const [created] = await sql`
    INSERT INTO users (
      id, name, email, phone, password_hash, role, status, client_id, managed_by, is_active, created_at, updated_at
    ) VALUES (
      ${userId}, ${payload.name}, ${payload.email.toLowerCase()}, ${payload.phone || null},
      ${hashedPassword}, ${payload.role}, ${payload.status}, ${payload.client_id || null},
      ${managedBy}, true, NOW(), NOW()
    )
    RETURNING id, name, email, phone, role, status, client_id, managed_by, is_active, created_at
  `;

  // Auto-assign to Sub-Admin if created by Sub-Admin
  if (user.role === "sub_admin") {
    const assignId = crypto.randomUUID();
    await sql`
      INSERT INTO sub_admin_assignments (id, sub_admin_id, employee_id, active, assigned_at)
      VALUES (${assignId}, ${user.id}, ${userId}, true, NOW())
      ON CONFLICT DO NOTHING
    `;
  }

  // Client assignments if provided
  if (payload.assigned_client_ids && payload.assigned_client_ids.length > 0) {
    for (const cid of payload.assigned_client_ids) {
      await sql`
        INSERT INTO employee_clients (id, client_id, employee_id, is_primary, active, assigned_at)
        VALUES (${crypto.randomUUID()}, ${cid}, ${userId}, false, true, NOW())
        ON CONFLICT DO NOTHING
      `;
    }
  }

  // Activity Log
  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'user_created',
      ${JSON.stringify({ created_user_id: userId, email: payload.email, role: payload.role })}, NOW()
    )
  `;

  const [enriched] = await enrichUsers(sql, [created]);
  return c.json(enriched, 201);
};

employeesRouter.post("/employees", requireRoles("super_admin", "sub_admin"), createUserHandler);
employeesRouter.post("/users", requireRoles("super_admin", "sub_admin"), createUserHandler);

/**
 * 5. PUT / PATCH /api/employees/:user_id and /api/users/:user_id
 */
const updateUserHandler = async (c: any) => {
  const userId = c.req.param("user_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = UserUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  const sql = getDb(c.env.DATABASE_URL);

  const scopedEids = await getScopedEmployeeIds(sql, user);
  if (scopedEids !== null && !scopedEids.includes(userId)) {
    return c.json({ detail: "User not found or outside your management scope" }, 403);
  }

  const existing = await sql`SELECT * FROM users WHERE id = ${userId} LIMIT 1`;
  if (existing.length === 0) {
    return c.json({ detail: "User not found" }, 404);
  }
  const current = existing[0];

  const nameVal = payload.name !== undefined ? payload.name : current.name;
  const emailVal = payload.email !== undefined ? payload.email.toLowerCase() : current.email;
  const phoneVal = payload.phone !== undefined ? payload.phone : current.phone;
  const roleVal = payload.role !== undefined ? payload.role : current.role;
  const statusVal = payload.status !== undefined ? payload.status : current.status;
  const clientIdVal = payload.client_id !== undefined ? payload.client_id : current.client_id;
  const isActiveVal = payload.is_active !== undefined ? payload.is_active : current.is_active;

  let passwordHash = current.password_hash || current.hashed_password;
  if (payload.password) {
    passwordHash = await hashPassword(payload.password);
  }

  const [updated] = await sql`
    UPDATE users SET
      name = ${nameVal},
      email = ${emailVal},
      phone = ${phoneVal},
      password_hash = ${passwordHash},
      role = ${roleVal},
      status = ${statusVal},
      client_id = ${clientIdVal},
      is_active = ${isActiveVal},
      updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, name, email, phone, role, status, client_id, managed_by, is_active, created_at
  `;

  if (payload.assigned_client_ids) {
    await sql`UPDATE employee_clients SET active = false WHERE employee_id = ${userId}`;
    for (const cid of payload.assigned_client_ids) {
      await sql`
        INSERT INTO employee_clients (id, client_id, employee_id, is_primary, active, assigned_at)
        VALUES (${crypto.randomUUID()}, ${cid}, ${userId}, false, true, NOW())
        ON CONFLICT (employee_id, client_id)
        DO UPDATE SET active = true, assigned_at = NOW()
      `;
    }
  }

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'user_updated',
      ${JSON.stringify({ updated_user_id: userId, email: emailVal })}, NOW()
    )
  `;

  const [enriched] = await enrichUsers(sql, [updated]);
  return c.json(enriched);
};

employeesRouter.put("/employees/:user_id", requireRoles("super_admin", "sub_admin"), updateUserHandler);
employeesRouter.patch("/employees/:user_id", requireRoles("super_admin", "sub_admin"), updateUserHandler);
employeesRouter.patch("/employees/:user_id/status", requireRoles("super_admin", "sub_admin"), updateUserHandler);
employeesRouter.put("/users/:user_id", requireRoles("super_admin", "sub_admin"), updateUserHandler);
employeesRouter.patch("/users/:user_id", requireRoles("super_admin", "sub_admin"), updateUserHandler);

/**
 * 6. POST /api/employees/:user_id/activate & /api/users/:user_id/activate
 */
const activateUserHandler = async (c: any) => {
  const userId = c.req.param("user_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedEids = await getScopedEmployeeIds(sql, user);
  if (scopedEids !== null && !scopedEids.includes(userId)) {
    return c.json({ detail: "Forbidden" }, 403);
  }

  const [updated] = await sql`
    UPDATE users SET status = 'active', is_active = true, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, name, email, phone, role, status, client_id, managed_by, is_active, created_at
  `;

  if (!updated) {
    return c.json({ detail: "User not found" }, 404);
  }

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (${crypto.randomUUID()}, ${user.id}, 'user_activated', ${JSON.stringify({ user_id: userId })}, NOW())
  `;

  const [enriched] = await enrichUsers(sql, [updated]);
  return c.json(enriched);
};

employeesRouter.post("/employees/:user_id/activate", requireRoles("super_admin", "sub_admin"), activateUserHandler);
employeesRouter.post("/users/:user_id/activate", requireRoles("super_admin", "sub_admin"), activateUserHandler);

/**
 * 7. POST /api/employees/:user_id/deactivate & /api/users/:user_id/deactivate
 */
const deactivateUserHandler = async (c: any) => {
  const userId = c.req.param("user_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedEids = await getScopedEmployeeIds(sql, user);
  if (scopedEids !== null && !scopedEids.includes(userId)) {
    return c.json({ detail: "Forbidden" }, 403);
  }

  const [updated] = await sql`
    UPDATE users SET status = 'inactive', is_active = false, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, name, email, phone, role, status, client_id, managed_by, is_active, created_at
  `;

  if (!updated) {
    return c.json({ detail: "User not found" }, 404);
  }

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (${crypto.randomUUID()}, ${user.id}, 'user_deactivated', ${JSON.stringify({ user_id: userId })}, NOW())
  `;

  const [enriched] = await enrichUsers(sql, [updated]);
  return c.json(enriched);
};

employeesRouter.post("/employees/:user_id/deactivate", requireRoles("super_admin", "sub_admin"), deactivateUserHandler);
employeesRouter.post("/users/:user_id/deactivate", requireRoles("super_admin", "sub_admin"), deactivateUserHandler);

/**
 * 8. POST /api/employees/:user_id/archive & /api/users/:user_id/archive
 */
const archiveUserHandler = async (c: any) => {
  const userId = c.req.param("user_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedEids = await getScopedEmployeeIds(sql, user);
  if (scopedEids !== null && !scopedEids.includes(userId)) {
    return c.json({ detail: "Forbidden" }, 403);
  }

  const [updated] = await sql`
    UPDATE users SET status = 'archived', is_active = false, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id, name, email, phone, role, status, client_id, managed_by, is_active, created_at
  `;

  if (!updated) {
    return c.json({ detail: "User not found" }, 404);
  }

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (${crypto.randomUUID()}, ${user.id}, 'user_archived', ${JSON.stringify({ user_id: userId })}, NOW())
  `;

  const [enriched] = await enrichUsers(sql, [updated]);
  return c.json(enriched);
};

employeesRouter.post("/employees/:user_id/archive", requireRoles("super_admin", "sub_admin"), archiveUserHandler);
employeesRouter.post("/users/:user_id/archive", requireRoles("super_admin", "sub_admin"), archiveUserHandler);

/**
 * 9. POST /api/employees/:user_id/reset-password & /api/users/:user_id/reset-password
 */
const resetPasswordHandler = async (c: any) => {
  const userId = c.req.param("user_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = ResetPasswordSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  const sql = getDb(c.env.DATABASE_URL);

  const scopedEids = await getScopedEmployeeIds(sql, user);
  if (scopedEids !== null && !scopedEids.includes(userId)) {
    return c.json({ detail: "Forbidden" }, 403);
  }

  const hashedPassword = await hashPassword(payload.new_password);
  const [updated] = await sql`
    UPDATE users SET password_hash = ${hashedPassword}, updated_at = NOW()
    WHERE id = ${userId}
    RETURNING id
  `;

  if (!updated) {
    return c.json({ detail: "User not found" }, 404);
  }

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (${crypto.randomUUID()}, ${user.id}, 'password_reset', ${JSON.stringify({ target_user_id: userId })}, NOW())
  `;

  return c.json({ message: "Password reset successfully" });
};

employeesRouter.post("/employees/:user_id/reset-password", requireRoles("super_admin", "sub_admin"), resetPasswordHandler);
employeesRouter.post("/users/:user_id/reset-password", requireRoles("super_admin", "sub_admin"), resetPasswordHandler);

/**
 * 10. DELETE /api/employees/:user_id and /api/users/:user_id (Safe delete - Super Admin only)
 */
const deleteUserHandler = async (c: any) => {
  const userId = c.req.param("user_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const existing = await sql`SELECT * FROM users WHERE id = ${userId} LIMIT 1`;
  if (existing.length === 0) {
    return c.json({ detail: "User not found" }, 404);
  }
  const targetUser = existing[0];

  // Dependency checks
  const [resumes, apps, chats, targets, atts] = await Promise.all([
    sql`SELECT count(*)::int as count FROM resumes WHERE uploaded_by = ${userId}`,
    sql`SELECT count(*)::int as count FROM applications WHERE employee_id = ${userId}`,
    sql`SELECT count(*)::int as count FROM chat_messages WHERE sender_id = ${userId}`,
    sql`SELECT count(*)::int as count FROM targets WHERE employee_id = ${userId}`,
    sql`SELECT count(*)::int as count FROM attendance WHERE employee_id = ${userId}`,
  ]);

  const reasons: string[] = [];
  if (resumes[0]?.count > 0) reasons.push(`${resumes[0].count} resume(s)`);
  if (apps[0]?.count > 0) reasons.push(`${apps[0].count} application(s)`);
  if (chats[0]?.count > 0) reasons.push(`${chats[0].count} chat message(s)`);
  if (targets[0]?.count > 0) reasons.push(`${targets[0].count} target quota(s)`);
  if (atts[0]?.count > 0) reasons.push(`${atts[0].count} attendance record(s)`);

  if (reasons.length > 0) {
    return c.json(
      {
        detail: `User '${targetUser.name}' cannot be deleted because ${reasons.join(
          ", "
        )} exist. Deactivate or archive this user instead.`,
      },
      400
    );
  }

  // Safe delete
  await sql`DELETE FROM employee_clients WHERE employee_id = ${userId}`;
  await sql`DELETE FROM sub_admin_assignments WHERE employee_id = ${userId} OR sub_admin_id = ${userId}`;
  await sql`DELETE FROM users WHERE id = ${userId}`;

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'user_deleted',
      ${JSON.stringify({ deleted_user_id: userId, name: targetUser.name })}, NOW()
    )
  `;

  return c.json({ message: "User deleted successfully" });
};

employeesRouter.delete("/employees/:user_id", requireRoles("super_admin"), deleteUserHandler);
employeesRouter.delete("/users/:user_id", requireRoles("super_admin"), deleteUserHandler);
