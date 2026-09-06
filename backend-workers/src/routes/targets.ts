import { Hono } from "hono";
import { getDb } from "../db";
import { requireAuth, requireRoles } from "../middleware/auth";
import { TargetSetRequestSchema } from "../schemas/targets";
import type { Bindings, Variables } from "../types";

export const targetsRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

targetsRouter.use("*", requireAuth);

// 1. GET /api/targets
targetsRouter.get("/", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);
  const employeeId = c.req.query("employee_id");

  let rows: any[];

  if (user.role === "super_admin" || user.role === "admin") {
    if (employeeId) {
      rows = await sql`
        SELECT t.id, t.employee_id, u.name as employee_name, t.client_id, c.company_name as client_name,
               t.daily_target, t.status, t.effective_date
        FROM targets t
        JOIN users u ON u.id = t.employee_id
        JOIN clients c ON c.id = t.client_id
        WHERE t.employee_id = ${employeeId}
        ORDER BY t.effective_date DESC
      `;
    } else {
      rows = await sql`
        SELECT t.id, t.employee_id, u.name as employee_name, t.client_id, c.company_name as client_name,
               t.daily_target, t.status, t.effective_date
        FROM targets t
        JOIN users u ON u.id = t.employee_id
        JOIN clients c ON c.id = t.client_id
        ORDER BY t.effective_date DESC
      `;
    }
  } else if (user.role === "sub_admin") {
    const subClients = await sql`
      SELECT client_id FROM sub_admin_clients WHERE user_id = ${user.id}
    `;
    const allowedClientIds = subClients.map((r: any) => String(r.client_id));

    if (allowedClientIds.length === 0) {
      return c.json([]);
    }

    if (employeeId) {
      rows = await sql`
        SELECT t.id, t.employee_id, u.name as employee_name, t.client_id, c.company_name as client_name,
               t.daily_target, t.status, t.effective_date
        FROM targets t
        JOIN users u ON u.id = t.employee_id
        JOIN clients c ON c.id = t.client_id
        WHERE t.client_id = ANY(${allowedClientIds}) AND t.employee_id = ${employeeId}
        ORDER BY t.effective_date DESC
      `;
    } else {
      rows = await sql`
        SELECT t.id, t.employee_id, u.name as employee_name, t.client_id, c.company_name as client_name,
               t.daily_target, t.status, t.effective_date
        FROM targets t
        JOIN users u ON u.id = t.employee_id
        JOIN clients c ON c.id = t.client_id
        WHERE t.client_id = ANY(${allowedClientIds})
        ORDER BY t.effective_date DESC
      `;
    }
  } else {
    // Employee / recruiter sees own targets
    rows = await sql`
      SELECT t.id, t.employee_id, u.name as employee_name, t.client_id, c.company_name as client_name,
             t.daily_target, t.status, t.effective_date
      FROM targets t
      JOIN users u ON u.id = t.employee_id
      JOIN clients c ON c.id = t.client_id
      WHERE t.employee_id = ${user.id}
      ORDER BY t.effective_date DESC
    `;
  }

  return c.json(
    rows.map((r: any) => ({
      id: r.id,
      employee_id: r.employee_id,
      employee_name: r.employee_name || "Employee",
      client_id: r.client_id,
      client_name: r.client_name || "Client",
      daily_target: r.daily_target,
      status: r.status,
      effective_date: r.effective_date,
    }))
  );
});

// 2. POST /api/targets
targetsRouter.post("/", requireRoles("super_admin", "admin", "sub_admin"), async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);
  const parseResult = TargetSetRequestSchema.safeParse(body);

  if (!parseResult.success) {
    return c.json(
      { detail: parseResult.error.issues[0]?.message || "Validation error" },
      400
    );
  }

  const { employee_id, client_id, daily_target, status } = parseResult.data;
  const sql = getDb(c.env.DATABASE_URL);

  if (user.role === "sub_admin") {
    const subClients = await sql`
      SELECT client_id FROM sub_admin_clients
      WHERE user_id = ${user.id} AND client_id = ${client_id}
    `;
    if (subClients.length === 0) {
      return c.json(
        { detail: "Cannot set targets for resources outside your management scope." },
        403
      );
    }
  }

  // Check existing target
  const existing = await sql`
    SELECT id FROM targets
    WHERE employee_id = ${employee_id} AND client_id = ${client_id}
    LIMIT 1
  `;

  let targetId: string;
  if (existing.length > 0) {
    targetId = existing[0].id;
    await sql`
      UPDATE targets
      SET daily_target = ${daily_target}, status = ${status}, effective_date = CURRENT_DATE
      WHERE id = ${targetId}
    `;
  } else {
    targetId = crypto.randomUUID();
    await sql`
      INSERT INTO targets (id, employee_id, client_id, daily_target, status, effective_date, created_at)
      VALUES (${targetId}, ${employee_id}, ${client_id}, ${daily_target}, ${status}, CURRENT_DATE, NOW())
    `;
  }

  // Return complete response
  const rows = await sql`
    SELECT t.id, t.employee_id, u.name as employee_name, t.client_id, c.company_name as client_name,
           t.daily_target, t.status, t.effective_date
    FROM targets t
    JOIN users u ON u.id = t.employee_id
    JOIN clients c ON c.id = t.client_id
    WHERE t.id = ${targetId}
    LIMIT 1
  `;

  const r = rows[0];
  return c.json({
    id: r.id,
    employee_id: r.employee_id,
    employee_name: r.employee_name,
    client_id: r.client_id,
    client_name: r.client_name,
    daily_target: r.daily_target,
    status: r.status,
    effective_date: r.effective_date,
  });
});

// 3. POST /api/targets/:id/pause
targetsRouter.post("/:id/pause", requireRoles("super_admin", "admin", "sub_admin"), async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);

  await sql`UPDATE targets SET status = 'paused' WHERE id = ${id}`;
  return c.json({ message: "Target paused successfully" });
});

// 4. POST /api/targets/:id/resume
targetsRouter.post("/:id/resume", requireRoles("super_admin", "admin", "sub_admin"), async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);

  await sql`UPDATE targets SET status = 'active' WHERE id = ${id}`;
  return c.json({ message: "Target resumed successfully" });
});

// 5. POST /api/targets/:id/end
targetsRouter.post("/:id/end", requireRoles("super_admin", "admin", "sub_admin"), async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);

  await sql`UPDATE targets SET status = 'ended' WHERE id = ${id}`;
  return c.json({ message: "Target ended successfully" });
});

// 6. DELETE /api/targets/:id
targetsRouter.delete("/:id", requireRoles("super_admin", "admin", "sub_admin"), async (c) => {
  const id = c.req.param("id");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`SELECT effective_date FROM targets WHERE id = ${id} LIMIT 1`;
  if (rows.length === 0) {
    return c.json({ detail: "Target not found" }, 404);
  }

  const effectiveDate = new Date(rows[0].effective_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (effectiveDate < today) {
    return c.json(
      { detail: "Cannot delete targets that are already past effective date. End or pause the target instead." },
      400
    );
  }

  await sql`DELETE FROM targets WHERE id = ${id}`;
  return c.json({ message: "Target deleted successfully" });
});

// 7. GET /api/targets/progress (SQL-Aggregated Progress)
targetsRouter.get("/progress", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  let targetEmpId = user.id;
  const requestedEmpId = c.req.query("employee_id");
  if (requestedEmpId && (user.role === "super_admin" || user.role === "admin" || user.role === "sub_admin")) {
    targetEmpId = requestedEmpId;
  }

  // Neon SQL-aggregated progress
  const rows = await sql`
    SELECT
      t.id,
      t.client_id,
      c.company_name as client_name,
      t.daily_target,
      COALESCE(COUNT(a.id), 0)::int as achieved_count,
      CASE
        WHEN t.daily_target > 0 THEN ROUND((COALESCE(COUNT(a.id), 0)::numeric / t.daily_target) * 100, 1)::float
        ELSE 0.0
      END as completion_percentage
    FROM targets t
    JOIN clients c ON c.id = t.client_id
    LEFT JOIN applications a
      ON a.employee_id = t.employee_id
      AND a.client_id = t.client_id
      AND a.created_at >= CURRENT_DATE
    WHERE t.employee_id = ${targetEmpId} AND t.status = 'active'
    GROUP BY t.id, t.client_id, c.company_name, t.daily_target
  `;

  let totalTarget = 0;
  let totalAchieved = 0;

  const clientBreakdown = rows.map((r: any) => {
    totalTarget += Number(r.daily_target);
    totalAchieved += Number(r.achieved_count);
    return {
      client_id: r.client_id,
      client_name: r.client_name,
      daily_target: r.daily_target,
      achieved_count: r.achieved_count,
      completion_percentage: r.completion_percentage,
    };
  });

  const overallPercentage = totalTarget > 0 ? Number(((totalAchieved / totalTarget) * 100).toFixed(1)) : 0.0;

  return c.json({
    total_target: totalTarget,
    total_achieved: totalAchieved,
    overall_percentage: overallPercentage,
    client_breakdown: clientBreakdown,
  });
});
