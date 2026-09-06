/**
 * Sub-Admins Management Router for ApplyFlow Cloudflare Workers.
 * Provides 100% API parity with FastAPI backend/app/modules/users.
 *
 * Endpoints:
 * - GET    /api/sub-admins
 * - POST   /api/sub-admins
 * - GET    /api/sub-admins/:id/assignments
 * - PUT    /api/sub-admins/:id/assignments
 * - POST   /api/sub-admins/:id/assignments
 * - PUT    /api/sub-admins/:id
 * - PATCH  /api/sub-admins/:id
 * - POST   /api/sub-admins/:id/activate
 * - POST   /api/sub-admins/:id/deactivate
 * - DELETE /api/sub-admins/:id
 */

import { Hono } from "hono";
import { hashPassword } from "../auth";
import { getDb } from "../db";
import { requireAuth, requireRoles } from "../middleware/auth";
import type { Bindings, Variables } from "../types";

export const subAdminsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All Sub-Admin management endpoints require Super Admin or Admin access
subAdminsRouter.use("*", requireAuth);
subAdminsRouter.use("*", requireRoles("super_admin", "admin"));

/**
 * Helper: Fetch sub-admin list or single sub-admin with assigned resources
 */
async function fetchSubAdminsHelper(
  sql: any,
  options: { statusFilter?: string | null; singleId?: string | null } = {}
) {
  let subAdmins: any[] = [];
  if (options.singleId) {
    subAdmins = await sql`
      SELECT id, name, email, phone, role, status, is_active, created_at
      FROM users
      WHERE id = ${options.singleId} AND role = 'sub_admin'
      LIMIT 1
    `;
  } else if (options.statusFilter && options.statusFilter !== "all") {
    subAdmins = await sql`
      SELECT id, name, email, phone, role, status, is_active, created_at
      FROM users
      WHERE role = 'sub_admin' AND status = ${options.statusFilter}
      ORDER BY name ASC
    `;
  } else {
    subAdmins = await sql`
      SELECT id, name, email, phone, role, status, is_active, created_at
      FROM users
      WHERE role = 'sub_admin'
      ORDER BY name ASC
    `;
  }

  if (subAdmins.length === 0) {
    return [];
  }

  const saIds = subAdmins.map((s: any) => s.id).filter(Boolean).map(String);

  // 1. Fetch assigned clients in 1 query
  const clientsMap: Record<string, Array<{ id: string; company_name: string }>> = {};
  if (saIds.length > 0) {
    const clientRows = await sql`
      SELECT saa.sub_admin_id, c.id, c.company_name
      FROM sub_admin_assignments saa
      JOIN clients c ON saa.client_id = c.id
      WHERE saa.sub_admin_id = ANY(${saIds})
        AND saa.client_id IS NOT NULL
        AND saa.active = true
        AND c.is_active = true
      ORDER BY c.company_name ASC
    `;
    for (const r of clientRows) {
      const said = String(r.sub_admin_id);
      if (!clientsMap[said]) clientsMap[said] = [];
      clientsMap[said].push({ id: r.id, company_name: r.company_name });
    }
  }

  // 2. Fetch assigned employees in 1 query
  const empsMap: Record<string, Array<{ id: string; name: string; email: string }>> = {};
  if (saIds.length > 0) {
    const empRows = await sql`
      SELECT saa.sub_admin_id, u.id, u.name, u.email
      FROM sub_admin_assignments saa
      JOIN users u ON saa.employee_id = u.id
      WHERE saa.sub_admin_id = ANY(${saIds})
        AND saa.employee_id IS NOT NULL
        AND saa.active = true
        AND u.is_active = true
      ORDER BY u.name ASC
    `;
    for (const r of empRows) {
      const said = String(r.sub_admin_id);
      if (!empsMap[said]) empsMap[said] = [];
      empsMap[said].push({ id: r.id, name: r.name, email: r.email });
    }
  }

  return subAdmins.map((sa: any) => {
    const said = String(sa.id);
    const assignedClients = clientsMap[said] || [];
    const assignedEmployees = empsMap[said] || [];

    return {
      id: sa.id,
      name: sa.name,
      email: sa.email,
      phone: sa.phone || null,
      role: "sub_admin",
      status: sa.status || (sa.is_active ? "active" : "inactive"),
      is_active: Boolean(sa.is_active),
      created_at: sa.created_at,
      assigned_clients_count: assignedClients.length,
      assigned_employees_count: assignedEmployees.length,
      assigned_clients: assignedClients,
      assigned_employees: assignedEmployees,
    };
  });
}

/**
 * 1. GET /api/sub-admins
 * List all Sub-Admins with assigned resource counts.
 */
subAdminsRouter.get("/", async (c) => {
  const sql = getDb(c.env.DATABASE_URL);
  const statusFilter = c.req.query("status") || null;

  try {
    const list = await fetchSubAdminsHelper(sql, { statusFilter });
    return c.json(list);
  } catch (err: any) {
    console.error("[List Sub-Admins Error]", err);
    return c.json({ detail: `Failed to load sub-admins: ${err.message}` }, 500);
  }
});

/**
 * 2. POST /api/sub-admins
 * Create a new Sub-Admin with assigned clients and employees.
 */
subAdminsRouter.post("/", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);
  const payload = await c.req.json().catch(() => ({}));

  const name = (payload.name || "").trim();
  const email = (payload.email || "").trim().toLowerCase();
  const password = payload.password || "";
  const phone = payload.phone ? payload.phone.trim() : null;
  const clientIds: string[] = Array.isArray(payload.client_ids)
    ? payload.client_ids.filter(Boolean).map(String)
    : [];
  const employeeIds: string[] = Array.isArray(payload.employee_ids)
    ? payload.employee_ids.filter(Boolean).map(String)
    : [];

  if (!name || !email || !password) {
    return c.json({ detail: "Name, email, and password are required." }, 400);
  }

  try {
    const existing = await sql`SELECT id FROM users WHERE LOWER(email) = ${email} LIMIT 1`;
    if (existing.length > 0) {
      return c.json({ detail: "A user with this email already exists." }, 400);
    }

    const hashedPassword = await hashPassword(password);
    const newId = crypto.randomUUID();

    await sql`
      INSERT INTO users (
        id, name, email, phone, password_hash, hashed_password, role, status, managed_by, is_active, created_at, updated_at
      )
      VALUES (
        ${newId}, ${name}, ${email}, ${phone}, ${hashedPassword}, ${hashedPassword}, 'sub_admin', 'active', ${user.id}, true, NOW(), NOW()
      )
    `;

    for (const cid of clientIds) {
      await sql`
        INSERT INTO sub_admin_assignments (id, sub_admin_id, client_id, active, assigned_at)
        VALUES (${crypto.randomUUID()}, ${newId}, ${cid}, true, NOW())
      `;
    }

    for (const eid of employeeIds) {
      await sql`
        INSERT INTO sub_admin_assignments (id, sub_admin_id, employee_id, active, assigned_at)
        VALUES (${crypto.randomUUID()}, ${newId}, ${eid}, true, NOW())
      `;
    }

    try {
      await sql`
        INSERT INTO activity_logs (id, user_id, action, details, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${user.id}, 'sub_admin_created',
          ${JSON.stringify({ sub_admin_id: newId, name, message: `Admin created Sub-Admin ${name}.` })},
          NOW()
        )
      `;
    } catch {
      // Non-blocking log
    }

    const [created] = await fetchSubAdminsHelper(sql, { singleId: newId });
    return c.json(created, 201);
  } catch (err: any) {
    console.error("[Create Sub-Admin Error]", err);
    return c.json({ detail: `Failed to create sub-admin: ${err.message}` }, 500);
  }
});

/**
 * 3. GET /api/sub-admins/:id/assignments
 * Get assigned and available resources for a Sub-Admin.
 */
subAdminsRouter.get("/:id/assignments", async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);

  try {
    const saCheck = await sql`
      SELECT id FROM users WHERE id = ${id} AND role = 'sub_admin' LIMIT 1
    `;
    if (saCheck.length === 0) {
      return c.json({ detail: "Sub-Admin not found" }, 404);
    }

    // Assigned client IDs
    const clientAssignments = await sql`
      SELECT client_id FROM sub_admin_assignments WHERE sub_admin_id = ${id} AND active = true AND client_id IS NOT NULL
      UNION
      SELECT id as client_id FROM clients WHERE managed_by = ${id}
    `;
    const assignedClientIds = clientAssignments.map((r: any) => r.client_id).filter(Boolean);

    // Assigned employee IDs
    const empAssignments = await sql`
      SELECT employee_id FROM sub_admin_assignments WHERE sub_admin_id = ${id} AND active = true AND employee_id IS NOT NULL
      UNION
      SELECT id as employee_id FROM users WHERE managed_by = ${id}
    `;
    const assignedEmployeeIds = empAssignments.map((r: any) => r.employee_id).filter(Boolean);

    // All available active clients
    const availableClients = await sql`
      SELECT id, company_name FROM clients WHERE is_active = true ORDER BY company_name ASC
    `;

    // All available active employees
    const availableEmployees = await sql`
      SELECT id, name, email FROM users WHERE role IN ('employee', 'recruiter') AND is_active = true ORDER BY name ASC
    `;

    return c.json({
      sub_admin_id: id,
      assigned_client_ids: assignedClientIds,
      assigned_employee_ids: assignedEmployeeIds,
      available_clients: availableClients.map((cl: any) => ({
        id: cl.id,
        company_name: cl.company_name,
      })),
      available_employees: availableEmployees.map((e: any) => ({
        id: e.id,
        name: e.name,
        email: e.email,
      })),
    });
  } catch (err: any) {
    console.error("[Get Sub-Admin Assignments Error]", err);
    return c.json({ detail: `Failed to load assignments: ${err.message}` }, 500);
  }
});

/**
 * 4. PUT & POST /api/sub-admins/:id/assignments
 * Update assigned clients and employees for a Sub-Admin.
 */
const updateAssignmentsHandler = async (c: any) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);
  const payload = await c.req.json().catch(() => ({}));

  const clientIds: string[] = Array.isArray(payload.client_ids)
    ? payload.client_ids.filter(Boolean).map(String)
    : [];
  const employeeIds: string[] = Array.isArray(payload.employee_ids)
    ? payload.employee_ids.filter(Boolean).map(String)
    : [];

  try {
    const saCheck = await sql`SELECT id FROM users WHERE id = ${id} AND role = 'sub_admin' LIMIT 1`;
    if (saCheck.length === 0) {
      return c.json({ detail: "Sub-Admin not found" }, 404);
    }

    // Replace assignments
    await sql`DELETE FROM sub_admin_assignments WHERE sub_admin_id = ${id}`;

    for (const cid of clientIds) {
      await sql`
        INSERT INTO sub_admin_assignments (id, sub_admin_id, client_id, active, assigned_at)
        VALUES (${crypto.randomUUID()}, ${id}, ${cid}, true, NOW())
      `;
    }

    for (const eid of employeeIds) {
      await sql`
        INSERT INTO sub_admin_assignments (id, sub_admin_id, employee_id, active, assigned_at)
        VALUES (${crypto.randomUUID()}, ${id}, ${eid}, true, NOW())
      `;
    }

    const [updated] = await fetchSubAdminsHelper(sql, { singleId: id });
    return c.json(updated);
  } catch (err: any) {
    console.error("[Update Sub-Admin Assignments Error]", err);
    return c.json({ detail: `Failed to update assignments: ${err.message}` }, 500);
  }
};

subAdminsRouter.put("/:id/assignments", updateAssignmentsHandler);
subAdminsRouter.post("/:id/assignments", updateAssignmentsHandler);

/**
 * 5. PUT & PATCH /api/sub-admins/:id
 * Update Sub-Admin profile details.
 */
const updateSubAdminProfileHandler = async (c: any) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);
  const payload = await c.req.json().catch(() => ({}));

  try {
    const [existing] = await sql`SELECT * FROM users WHERE id = ${id} AND role = 'sub_admin' LIMIT 1`;
    if (!existing) {
      return c.json({ detail: "Sub-Admin not found" }, 404);
    }

    let updatedEmail = existing.email;
    if (payload.email !== undefined && payload.email !== null) {
      const normEmail = payload.email.trim().toLowerCase();
      if (normEmail !== existing.email.toLowerCase()) {
        const dupCheck = await sql`
          SELECT id FROM users WHERE LOWER(email) = ${normEmail} AND id != ${id} LIMIT 1
        `;
        if (dupCheck.length > 0) {
          return c.json({ detail: "A user with this email address already exists." }, 400);
        }
        updatedEmail = normEmail;
      }
    }

    const updatedName = payload.name !== undefined ? payload.name.trim() : existing.name;
    const updatedPhone =
      payload.phone !== undefined ? (payload.phone ? payload.phone.trim() : null) : existing.phone;
    let passwordHash = existing.password_hash;
    if (payload.password) {
      passwordHash = await hashPassword(payload.password);
    }

    let isActive = existing.is_active;
    let status = existing.status || "active";
    if (payload.is_active !== undefined) {
      isActive = Boolean(payload.is_active);
      status = isActive ? "active" : "inactive";
    }
    if (payload.status !== undefined) {
      status = payload.status;
      isActive = status === "active";
    }

    await sql`
      UPDATE users
      SET
        name = ${updatedName},
        email = ${updatedEmail},
        phone = ${updatedPhone},
        password_hash = ${passwordHash},
        hashed_password = ${passwordHash},
        is_active = ${isActive},
        status = ${status},
        updated_at = NOW()
      WHERE id = ${id}
    `;

    // Handle assignments if provided
    if (payload.client_ids !== undefined || payload.employee_ids !== undefined) {
      await sql`DELETE FROM sub_admin_assignments WHERE sub_admin_id = ${id}`;

      if (Array.isArray(payload.client_ids)) {
        for (const cid of payload.client_ids) {
          if (cid) {
            await sql`
              INSERT INTO sub_admin_assignments (id, sub_admin_id, client_id, active, assigned_at)
              VALUES (${crypto.randomUUID()}, ${id}, ${cid}, true, NOW())
            `;
          }
        }
      }

      if (Array.isArray(payload.employee_ids)) {
        for (const eid of payload.employee_ids) {
          if (eid) {
            await sql`
              INSERT INTO sub_admin_assignments (id, sub_admin_id, employee_id, active, assigned_at)
              VALUES (${crypto.randomUUID()}, ${id}, ${eid}, true, NOW())
            `;
          }
        }
      }
    }

    try {
      await sql`
        INSERT INTO activity_logs (id, user_id, action, details, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${user.id}, 'sub_admin_updated',
          ${JSON.stringify({ sub_admin_id: id, name: updatedName, message: `Admin edited Sub-Admin ${updatedName}.` })},
          NOW()
        )
      `;
    } catch {
      // Non-blocking log
    }

    const [updated] = await fetchSubAdminsHelper(sql, { singleId: id });
    return c.json(updated);
  } catch (err: any) {
    console.error("[Update Sub-Admin Profile Error]", err);
    return c.json({ detail: `Failed to update sub-admin: ${err.message}` }, 500);
  }
};

subAdminsRouter.put("/:id", updateSubAdminProfileHandler);
subAdminsRouter.patch("/:id", updateSubAdminProfileHandler);

/**
 * 6. POST /api/sub-admins/:id/deactivate
 * Deactivate Sub-Admin: blocks login, managed employees reassigned to Admin.
 */
subAdminsRouter.post("/:id/deactivate", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  try {
    const [existing] = await sql`SELECT * FROM users WHERE id = ${id} AND role = 'sub_admin' LIMIT 1`;
    if (!existing) {
      return c.json({ detail: "Sub-Admin not found" }, 404);
    }

    await sql`
      UPDATE users
      SET is_active = false, status = 'inactive', updated_at = NOW()
      WHERE id = ${id}
    `;

    // Managed employees become temporarily owned by Admin
    await sql`
      UPDATE users
      SET managed_by = ${user.id}
      WHERE managed_by = ${id}
    `;

    try {
      await sql`
        INSERT INTO activity_logs (id, user_id, action, details, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${user.id}, 'sub_admin_deactivated',
          ${JSON.stringify({ sub_admin_id: id, name: existing.name, message: `Admin deactivated Sub-Admin ${existing.name}.` })},
          NOW()
        )
      `;
    } catch {
      // Non-blocking log
    }

    const [updated] = await fetchSubAdminsHelper(sql, { singleId: id });
    return c.json(updated);
  } catch (err: any) {
    console.error("[Deactivate Sub-Admin Error]", err);
    return c.json({ detail: `Failed to deactivate sub-admin: ${err.message}` }, 500);
  }
});

/**
 * 7. POST /api/sub-admins/:id/activate
 * Reactivate Sub-Admin.
 */
subAdminsRouter.post("/:id/activate", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  try {
    const [existing] = await sql`SELECT * FROM users WHERE id = ${id} AND role = 'sub_admin' LIMIT 1`;
    if (!existing) {
      return c.json({ detail: "Sub-Admin not found" }, 404);
    }

    await sql`
      UPDATE users
      SET is_active = true, status = 'active', updated_at = NOW()
      WHERE id = ${id}
    `;

    try {
      await sql`
        INSERT INTO activity_logs (id, user_id, action, details, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${user.id}, 'sub_admin_activated',
          ${JSON.stringify({ sub_admin_id: id, name: existing.name, message: `Admin reactivated Sub-Admin ${existing.name}.` })},
          NOW()
        )
      `;
    } catch {
      // Non-blocking log
    }

    const [updated] = await fetchSubAdminsHelper(sql, { singleId: id });
    return c.json(updated);
  } catch (err: any) {
    console.error("[Activate Sub-Admin Error]", err);
    return c.json({ detail: `Failed to activate sub-admin: ${err.message}` }, 500);
  }
});

/**
 * 8. DELETE /api/sub-admins/:id
 * Safe delete Sub-Admin: requires reassignment if managed employees/clients exist.
 */
subAdminsRouter.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const reassignToAdmin = c.req.query("reassign_to_admin") === "true";
  const reassignToSubAdminId = c.req.query("reassign_to_sub_admin_id") || null;

  try {
    const [existing] = await sql`SELECT * FROM users WHERE id = ${id} AND role = 'sub_admin' LIMIT 1`;
    if (!existing) {
      return c.json({ detail: "Sub-Admin not found" }, 404);
    }

    // Check dependencies
    const managedEmpsRes = await sql`
      SELECT COUNT(id)::int as count FROM users WHERE managed_by = ${id}
    `;
    const managedCount = managedEmpsRes[0]?.count || 0;

    const assignmentsRes = await sql`
      SELECT COUNT(id)::int as count FROM sub_admin_assignments WHERE sub_admin_id = ${id}
    `;
    const assignedCount = assignmentsRes[0]?.count || 0;

    if ((managedCount > 0 || assignedCount > 0) && !reassignToAdmin && !reassignToSubAdminId) {
      return c.json(
        { detail: "Reassign employees and clients before deleting." },
        400
      );
    }

    if (reassignToSubAdminId) {
      const targetCheck = await sql`
        SELECT id FROM users WHERE id = ${reassignToSubAdminId} AND role = 'sub_admin' LIMIT 1
      `;
      if (targetCheck.length === 0) {
        return c.json({ detail: "Target Sub-Admin not found." }, 400);
      }
      await sql`UPDATE users SET managed_by = ${reassignToSubAdminId} WHERE managed_by = ${id}`;
      await sql`UPDATE sub_admin_assignments SET sub_admin_id = ${reassignToSubAdminId} WHERE sub_admin_id = ${id}`;
    } else {
      // Reassign managed users to Admin and remove assignments
      await sql`UPDATE users SET managed_by = ${user.id} WHERE managed_by = ${id}`;
      await sql`DELETE FROM sub_admin_assignments WHERE sub_admin_id = ${id}`;
    }

    await sql`DELETE FROM users WHERE id = ${id}`;

    try {
      await sql`
        INSERT INTO activity_logs (id, user_id, action, details, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${user.id}, 'sub_admin_deleted',
          ${JSON.stringify({ sub_admin_id: id, name: existing.name, message: `Admin deleted Sub-Admin ${existing.name}.` })},
          NOW()
        )
      `;
    } catch {
      // Non-blocking log
    }

    return c.json({ message: "Sub-Admin deleted successfully" });
  } catch (err: any) {
    console.error("[Delete Sub-Admin Error]", err);
    return c.json({ detail: `Failed to delete sub-admin: ${err.message}` }, 500);
  }
});
