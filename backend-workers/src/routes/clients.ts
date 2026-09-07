/**
 * Clients Router for Cloudflare Workers (Hono).
 * Full feature and API parity with FastAPI app.modules.clients.router.
 */

import { Hono } from "hono";
import { hashPassword } from "../auth";
import { getDb } from "../db";
import { requireAuth, requireRoles } from "../middleware/auth";
import {
  AssignEmployeesSchema,
  ClientCreateSchema,
  ClientUpdateSchema,
} from "../schemas/clients";
import type { Bindings, UserPayload, Variables } from "../types";

export const clientsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All client endpoints require authentication
clientsRouter.use("*", requireAuth);

/**
 * Helper: Resolve permitted client IDs based on role
 */
async function getScopedClientIds(sql: any, user: UserPayload): Promise<string[] | null> {
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
    // If no explicit assignments, recruiters view active clients
    const activeClients = await sql`SELECT id as client_id FROM clients WHERE status = 'active'`;
    return activeClients.map((r: any) => String(r.client_id));
  }

  if (user.role === "client") {
    return user.client_id ? [String(user.client_id)] : [];
  }

  return [];
}

/**
 * Helper: Pre-fetch metrics and assigned recruiters for a set of client IDs
 */
async function fetchClientDetails(sql: any, clients: any[]): Promise<any[]> {
  if (!clients || clients.length === 0) return [];

  const clientIds = clients.map((c) => String(c.id));

  // 1. Assigned employees with user details
  const empRows = await sql`
    SELECT ec.client_id, u.id, u.name, u.email, ec.is_primary, ec.active, ec.assigned_at
    FROM employee_clients ec
    JOIN users u ON ec.employee_id = u.id
    WHERE ec.client_id = ANY(${clientIds}) AND u.is_active = true AND ec.active = true
    ORDER BY ec.is_primary DESC, u.name ASC
  `;

  const empMap: Record<string, any[]> = {};
  for (const row of empRows) {
    const cid = String(row.client_id);
    if (!empMap[cid]) empMap[cid] = [];
    empMap[cid].push({
      id: row.id,
      name: row.name,
      email: row.email,
      is_primary: Boolean(row.is_primary),
      active: Boolean(row.active),
      assigned_at: row.assigned_at,
    });
  }

  // 2. Metrics aggregations
  const [reqTotal, reqActive, resumesTotal, appsTotal] = await Promise.all([
    sql`
      SELECT client_id, count(*)::int as count
      FROM requirements
      WHERE client_id = ANY(${clientIds})
      GROUP BY client_id
    `,
    sql`
      SELECT client_id, count(*)::int as count
      FROM requirements
      WHERE client_id = ANY(${clientIds}) AND status = 'active'
      GROUP BY client_id
    `,
    sql`
      SELECT client_id, count(*)::int as count
      FROM resumes
      WHERE client_id = ANY(${clientIds})
      GROUP BY client_id
    `,
    sql`
      SELECT client_id, count(*)::int as count
      FROM applications
      WHERE client_id = ANY(${clientIds})
      GROUP BY client_id
    `,
  ]);

  const reqTotalMap = Object.fromEntries(reqTotal.map((r: any) => [String(r.client_id), Number(r.count)]));
  const reqActiveMap = Object.fromEntries(reqActive.map((r: any) => [String(r.client_id), Number(r.count)]));
  const resumesMap = Object.fromEntries(resumesTotal.map((r: any) => [String(r.client_id), Number(r.count)]));
  const appsMap = Object.fromEntries(appsTotal.map((r: any) => [String(r.client_id), Number(r.count)]));

  return clients.map((client) => {
    const cid = String(client.id);
    return {
      id: client.id,
      company_name: client.company_name,
      contact_person: client.contact_person,
      email: client.email,
      phone: client.phone,
      status: client.status,
      logo_url: client.logo_url,
      is_active: Boolean(client.is_active),
      deactivated_at: client.deactivated_at,
      archived_at: client.archived_at,
      created_at: client.created_at,
      assigned_employees: empMap[cid] || [],
      total_requirements: reqTotalMap[cid] || 0,
      active_requirements: reqActiveMap[cid] || 0,
      total_resumes: resumesMap[cid] || 0,
      total_applications: appsMap[cid] || 0,
    };
  });
}

/**
 * 1. GET /api/clients
 */
clientsRouter.get("/", async (c) => {
  const user = c.get("user");
  const statusFilter = c.req.query("status");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedCids = await getScopedClientIds(sql, user);
  if (scopedCids !== null && scopedCids.length === 0) {
    return c.json([]);
  }

  let clients: any[];

  if (scopedCids !== null) {
    if (statusFilter && statusFilter !== "all") {
      clients = await sql`
        SELECT * FROM clients
        WHERE id = ANY(${scopedCids}) AND status = ${statusFilter}
        ORDER BY company_name ASC
      `;
    } else if (!statusFilter) {
      clients = await sql`
        SELECT * FROM clients
        WHERE id = ANY(${scopedCids}) AND status != 'archived'
        ORDER BY company_name ASC
      `;
    } else {
      clients = await sql`
        SELECT * FROM clients
        WHERE id = ANY(${scopedCids})
        ORDER BY company_name ASC
      `;
    }
  } else {
    if (statusFilter && statusFilter !== "all") {
      clients = await sql`
        SELECT * FROM clients
        WHERE status = ${statusFilter}
        ORDER BY company_name ASC
      `;
    } else if (!statusFilter) {
      clients = await sql`
        SELECT * FROM clients
        WHERE status != 'archived'
        ORDER BY company_name ASC
      `;
    } else {
      clients = await sql`
        SELECT * FROM clients
        ORDER BY company_name ASC
      `;
    }
  }

  const enriched = await fetchClientDetails(sql, clients);
  return c.json(enriched);
});

/**
 * 2. GET /api/clients/:client_id
 */
clientsRouter.get("/:client_id", async (c) => {
  const clientId = c.req.param("client_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedCids = await getScopedClientIds(sql, user);
  if (scopedCids !== null && !scopedCids.includes(clientId)) {
    return c.json({ detail: "Client not found or outside your management scope" }, 404);
  }

  const rows = await sql`SELECT * FROM clients WHERE id = ${clientId} LIMIT 1`;
  if (!rows || rows.length === 0) {
    return c.json({ detail: "Client not found" }, 404);
  }

  const [enriched] = await fetchClientDetails(sql, rows);
  return c.json(enriched);
});

/**
 * 3. POST /api/clients (Admin & Sub-Admin)
 */
clientsRouter.post("/", requireRoles("super_admin", "admin", "sub_admin"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = ClientCreateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  const sql = getDb(c.env.DATABASE_URL);

  // Check duplicate company_name
  const existing = await sql`
    SELECT id FROM clients WHERE company_name = ${payload.company_name} LIMIT 1
  `;
  if (existing.length > 0) {
    return c.json({ detail: `Client '${payload.company_name}' already exists.` }, 409);
  }

  const clientId = crypto.randomUUID();
  const managedBy = user.role === "sub_admin" ? user.id : null;

  // Insert Client
  const [client] = await sql`
    INSERT INTO clients (
      id, company_name, contact_person, email, phone, status, logo_url, is_active, managed_by, created_at
    ) VALUES (
      ${clientId}, ${payload.company_name}, ${payload.contact_person || null},
      ${payload.email || null}, ${payload.phone || null}, ${payload.status || "active"},
      ${payload.logo_url || null}, true, ${managedBy}, NOW()
    )
    RETURNING *
  `;

  // Optional: Create client user login
  const loginEmail = (payload.email || "").trim().toLowerCase();
  const loginPassword = (payload.password || "").trim();
  if (loginEmail && loginPassword) {
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${loginEmail} AND role = 'client' LIMIT 1
    `;
    if (existingUser.length > 0) {
      return c.json({ detail: `A client login account already exists for ${loginEmail}.` }, 409);
    }

    const hashed = await hashPassword(loginPassword);
    const userId = crypto.randomUUID();
    const contactName = (payload.contact_person || payload.company_name).trim();

    await sql`
      INSERT INTO users (
        id, name, email, phone, password_hash, hashed_password, role, status, client_id, is_active, created_at, updated_at
      ) VALUES (
        ${userId}, ${contactName}, ${loginEmail}, ${payload.phone || null},
        ${hashed}, ${hashed}, 'client', 'active', ${clientId}, true, NOW(), NOW()
      )
    `;
  }

  // Create associated Chat Room
  const roomId = crypto.randomUUID();
  await sql`
    INSERT INTO chat_rooms (id, client_id, status, created_at, updated_at)
    VALUES (${roomId}, ${clientId}, 'active', NOW(), NOW())
    ON CONFLICT (client_id) DO NOTHING
  `;

  // Auto-assign to Sub-Admin if created by Sub-Admin
  if (user.role === "sub_admin") {
    const assignId = crypto.randomUUID();
    await sql`
      INSERT INTO sub_admin_assignments (id, sub_admin_id, client_id, active, assigned_at)
      VALUES (${assignId}, ${user.id}, ${clientId}, true, NOW())
      ON CONFLICT DO NOTHING
    `;
  }

  // Activity Log
  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'client_created',
      ${JSON.stringify({ client_id: clientId, company_name: payload.company_name })}, NOW()
    )
  `;

  const [enriched] = await fetchClientDetails(sql, [client]);
  return c.json(enriched, 201);
});

/**
 * 4. PUT / PATCH /api/clients/:client_id
 */
const updateClientHandler = async (c: any) => {
  const clientId = c.req.param("client_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = ClientUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  const sql = getDb(c.env.DATABASE_URL);

  const scopedCids = await getScopedClientIds(sql, user);
  if (scopedCids !== null && !scopedCids.includes(clientId)) {
    return c.json({ detail: "You do not have permission to edit this client." }, 403);
  }

  const existing = await sql`SELECT * FROM clients WHERE id = ${clientId} LIMIT 1`;
  if (existing.length === 0) {
    return c.json({ detail: "Client not found" }, 404);
  }

  const current = existing[0];
  const companyName = payload.company_name !== undefined ? payload.company_name : current.company_name;
  const contactPerson = payload.contact_person !== undefined ? payload.contact_person : current.contact_person;
  const email = payload.email !== undefined ? payload.email : current.email;
  const phone = payload.phone !== undefined ? payload.phone : current.phone;
  const statusVal = payload.status !== undefined ? payload.status : current.status;
  const logoUrl = payload.logo_url !== undefined ? payload.logo_url : current.logo_url;
  const isActive = payload.is_active !== undefined ? payload.is_active : current.is_active;

  const [updated] = await sql`
    UPDATE clients SET
      company_name = ${companyName},
      contact_person = ${contactPerson},
      email = ${email},
      phone = ${phone},
      status = ${statusVal},
      logo_url = ${logoUrl},
      is_active = ${isActive}
    WHERE id = ${clientId}
    RETURNING *
  `;

  // Update recruiter assignments if employee_ids / assigned_employee_ids / assignments provided
  const hasAssignments = payload.employee_ids !== undefined || payload.assigned_employee_ids !== undefined || payload.assignments !== undefined;
  if (hasAssignments) {
    // 1. Remove existing assignments for that client
    await sql`DELETE FROM employee_clients WHERE client_id = ${clientId}`;

    // 2. Insert newly selected employees into employee_clients
    let assignmentItems: Array<{ employee_id: string; is_primary: boolean; active: boolean }> = [];
    if (payload.assignments && payload.assignments.length > 0) {
      assignmentItems = payload.assignments;
    } else {
      const ids = payload.employee_ids || payload.assigned_employee_ids || [];
      assignmentItems = ids.map((eid) => ({ employee_id: eid, is_primary: false, active: true }));
    }

    const seen = new Set<string>();
    for (const item of assignmentItems) {
      if (!item.employee_id || seen.has(item.employee_id)) continue;
      seen.add(item.employee_id);
      const ecId = crypto.randomUUID();
      await sql`
        INSERT INTO employee_clients (id, client_id, employee_id, is_primary, active, assigned_at, assigned_by)
        VALUES (${ecId}, ${clientId}, ${item.employee_id}, ${Boolean(item.is_primary)}, ${item.active !== false}, NOW(), ${user.id})
      `;
    }
  }

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'client_updated',
      ${JSON.stringify({ client_id: clientId, company_name: updated.company_name })}, NOW()
    )
  `;

  const [enriched] = await fetchClientDetails(sql, [updated]);
  return c.json(enriched);
};

clientsRouter.put("/:client_id", requireRoles("super_admin", "admin", "sub_admin"), updateClientHandler);
clientsRouter.patch("/:client_id", requireRoles("super_admin", "admin", "sub_admin"), updateClientHandler);

/**
 * 5. POST /api/clients/:client_id/activate & reactivate
 */
const activateClientHandler = async (c: any) => {
  const clientId = c.req.param("client_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedCids = await getScopedClientIds(sql, user);
  if (scopedCids !== null && !scopedCids.includes(clientId)) {
    return c.json({ detail: "Forbidden" }, 403);
  }

  const [updated] = await sql`
    UPDATE clients SET
      status = 'active',
      is_active = true
    WHERE id = ${clientId}
    RETURNING *
  `;

  if (!updated) {
    return c.json({ detail: "Client not found" }, 404);
  }

  await sql`
    UPDATE chat_rooms SET status = 'active', updated_at = NOW() WHERE client_id = ${clientId}
  `;

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'client_activated',
      ${JSON.stringify({ client_id: clientId, company_name: updated.company_name })}, NOW()
    )
  `;

  const [enriched] = await fetchClientDetails(sql, [updated]);
  return c.json(enriched);
};

clientsRouter.post("/:client_id/activate", requireRoles("super_admin", "admin", "sub_admin"), activateClientHandler);
clientsRouter.post("/:client_id/reactivate", requireRoles("super_admin", "admin", "sub_admin"), activateClientHandler);

/**
 * 6. POST /api/clients/:client_id/deactivate
 */
clientsRouter.post("/:client_id/deactivate", requireRoles("super_admin", "admin", "sub_admin"), async (c) => {
  const clientId = c.req.param("client_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedCids = await getScopedClientIds(sql, user);
  if (scopedCids !== null && !scopedCids.includes(clientId)) {
    return c.json({ detail: "Forbidden" }, 403);
  }

  const [updated] = await sql`
    UPDATE clients SET
      status = 'inactive',
      is_active = false,
      deactivated_at = NOW()
    WHERE id = ${clientId}
    RETURNING *
  `;

  if (!updated) {
    return c.json({ detail: "Client not found" }, 404);
  }

  await sql`
    UPDATE chat_rooms SET status = 'read_only', updated_at = NOW() WHERE client_id = ${clientId}
  `;

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'client_deactivated',
      ${JSON.stringify({ client_id: clientId, company_name: updated.company_name })}, NOW()
    )
  `;

  const [enriched] = await fetchClientDetails(sql, [updated]);
  return c.json(enriched);
});

/**
 * 7. POST /api/clients/:client_id/archive
 */
clientsRouter.post("/:client_id/archive", requireRoles("super_admin", "admin", "sub_admin"), async (c) => {
  const clientId = c.req.param("client_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const scopedCids = await getScopedClientIds(sql, user);
  if (scopedCids !== null && !scopedCids.includes(clientId)) {
    return c.json({ detail: "Forbidden" }, 403);
  }

  const [updated] = await sql`
    UPDATE clients SET
      status = 'archived',
      is_active = false,
      archived_at = NOW()
    WHERE id = ${clientId}
    RETURNING *
  `;

  if (!updated) {
    return c.json({ detail: "Client not found" }, 404);
  }

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'client_archived',
      ${JSON.stringify({ client_id: clientId, company_name: updated.company_name })}, NOW()
    )
  `;

  const [enriched] = await fetchClientDetails(sql, [updated]);
  return c.json(enriched);
});

/**
 * 8. DELETE /api/clients/:client_id (Super Admin only safe delete)
 */
clientsRouter.delete("/:client_id", requireRoles("super_admin", "admin"), async (c) => {
  const clientId = c.req.param("client_id");
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const existing = await sql`SELECT * FROM clients WHERE id = ${clientId} LIMIT 1`;
  if (existing.length === 0) {
    return c.json({ detail: "Client not found" }, 404);
  }
  const client = existing[0];

  // Dependency checks
  const [reqs, apps, resumes, targets, chats] = await Promise.all([
    sql`SELECT count(*)::int as count FROM requirements WHERE client_id = ${clientId}`,
    sql`SELECT count(*)::int as count FROM applications WHERE client_id = ${clientId}`,
    sql`SELECT count(*)::int as count FROM resumes WHERE client_id = ${clientId}`,
    sql`SELECT count(*)::int as count FROM targets WHERE client_id = ${clientId}`,
    sql`
      SELECT count(m.id)::int as count
      FROM chat_messages m
      JOIN chat_rooms r ON m.room_id = r.id
      WHERE r.client_id = ${clientId}
    `,
  ]);

  const reasons: string[] = [];
  if (reqs[0]?.count > 0) reasons.push(`${reqs[0].count} job opening(s)`);
  if (apps[0]?.count > 0) reasons.push(`${apps[0].count} candidate application(s)`);
  if (resumes[0]?.count > 0) reasons.push(`${resumes[0].count} resume(s)`);
  if (chats[0]?.count > 0) reasons.push(`${chats[0].count} chat message(s)`);
  if (targets[0]?.count > 0) reasons.push(`${targets[0].count} target quota(s)`);

  if (reasons.length > 0) {
    return c.json(
      {
        detail: `Client '${client.company_name}' cannot be deleted because ${reasons.join(
          ", "
        )} are linked. Archive the client or remove linked requirements first.`,
      },
      400
    );
  }

  // Safe delete
  await sql`DELETE FROM chat_rooms WHERE client_id = ${clientId}`;
  await sql`DELETE FROM employee_clients WHERE client_id = ${clientId}`;
  await sql`DELETE FROM sub_admin_assignments WHERE client_id = ${clientId}`;
  await sql`DELETE FROM clients WHERE id = ${clientId}`;

  await sql`
    INSERT INTO activity_logs (id, user_id, action, details, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${user.id}, 'client_deleted',
      ${JSON.stringify({ client_id: clientId, company_name: client.company_name })}, NOW()
    )
  `;

  return c.json({ message: "Client deleted successfully" });
});

/**
 * 9. POST /api/clients/:client_id/employees & /assign
 */
const assignEmployeesHandler = async (c: any) => {
  const clientId = c.req.param("client_id");
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const parseResult = AssignEmployeesSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ detail: parseResult.error.issues[0]?.message || "Validation error" }, 400);
  }
  const payload = parseResult.data;

  const sql = getDb(c.env.DATABASE_URL);

  const existing = await sql`SELECT id FROM clients WHERE id = ${clientId} LIMIT 1`;
  if (existing.length === 0) {
    return c.json({ detail: "Client not found" }, 404);
  }

  if (user.role === "sub_admin") {
    const scopedCids = await getScopedClientIds(sql, user);
    if (!scopedCids || !scopedCids.includes(clientId)) {
      return c.json({ detail: "Cannot assign employees to a client outside your management scope." }, 403);
    }
  }

  let items: Array<{ employee_id: string; is_primary: boolean; active: boolean }> = [];
  if (payload.assignments && payload.assignments.length > 0) {
    items = payload.assignments;
  } else if (payload.employee_ids && payload.employee_ids.length > 0) {
    items = payload.employee_ids.map((eid) => ({ employee_id: eid, is_primary: false, active: true }));
  } else if (payload.employee_id) {
    items = [{ employee_id: payload.employee_id, is_primary: false, active: true }];
  }

  for (const item of items) {
    const ecId = crypto.randomUUID();
    await sql`
      INSERT INTO employee_clients (id, client_id, employee_id, is_primary, active, assigned_at)
      VALUES (${ecId}, ${clientId}, ${item.employee_id}, ${item.is_primary}, ${item.active}, NOW())
      ON CONFLICT (employee_id, client_id)
      DO UPDATE SET
        is_primary = EXCLUDED.is_primary,
        active = true,
        assigned_at = NOW()
    `;
  }

  return c.json({ message: "Recruiters assigned successfully" });
};

clientsRouter.post("/:client_id/employees", requireRoles("super_admin", "admin", "sub_admin"), assignEmployeesHandler);
clientsRouter.post("/:client_id/assign", requireRoles("super_admin", "admin", "sub_admin"), assignEmployeesHandler);

/**
 * 10. DELETE /api/clients/:client_id/employees/:employee_id
 */
clientsRouter.delete(
  "/:client_id/employees/:employee_id",
  requireRoles("super_admin", "admin", "sub_admin"),
  async (c) => {
    const clientId = c.req.param("client_id");
    const employeeId = c.req.param("employee_id");
    const user = c.get("user");
    const sql = getDb(c.env.DATABASE_URL);

    if (user.role === "sub_admin") {
      const scopedCids = await getScopedClientIds(sql, user);
      if (!scopedCids || !scopedCids.includes(clientId)) {
        return c.json({ detail: "Forbidden" }, 403);
      }
    }

    await sql`
      UPDATE employee_clients SET
        active = false
      WHERE client_id = ${clientId} AND employee_id = ${employeeId}
    `;

    return c.json({ message: "Recruiter assignment deactivated successfully" });
  }
);
