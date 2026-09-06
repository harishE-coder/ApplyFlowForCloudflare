import { Hono } from "hono";
import { getDb } from "../db";
import { requireAuth, requireRoles } from "../middleware/auth";
import type { Bindings, Variables } from "../types";

export const attendanceRouter = new Hono<{ Bindings: Bindings; Variables: Variables }>();

attendanceRouter.use("*", requireAuth);

function formatDuration(checkIn: Date | string, checkOut: Date | string): string {
  const start = new Date(checkIn).getTime();
  const end = new Date(checkOut).getTime();
  const diffSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

// 1. GET /api/attendance/status
attendanceRouter.get("/status", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const rows = await sql`
    SELECT id, employee_id, work_date, check_in, check_out, total_hours
    FROM attendance
    WHERE employee_id = ${user.id} AND work_date = CURRENT_DATE
    ORDER BY check_in DESC
    LIMIT 1
  `;

  if (rows.length === 0) {
    return c.json(null);
  }

  const r = rows[0];
  return c.json({
    id: r.id,
    employee_id: r.employee_id,
    work_date: r.work_date,
    check_in: r.check_in,
    check_out: r.check_out,
    total_hours: r.total_hours,
    is_active: r.check_out === null,
  });
});

// 2. POST /api/attendance/check-in
attendanceRouter.post("/check-in", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  // Guard against duplicate active sessions
  const activeRows = await sql`
    SELECT id, employee_id, work_date, check_in, check_out, total_hours
    FROM attendance
    WHERE employee_id = ${user.id} AND work_date = CURRENT_DATE AND check_out IS NULL
    LIMIT 1
  `;

  if (activeRows.length > 0) {
    return c.json(
      { detail: "Already checked in for active session. Please check out first." },
      409
    );
  }

  const recordId = crypto.randomUUID();
  const inserted = await sql`
    INSERT INTO attendance (id, employee_id, work_date, check_in)
    VALUES (${recordId}, ${user.id}, CURRENT_DATE, NOW())
    RETURNING id, employee_id, work_date, check_in, check_out, total_hours
  `;

  const r = inserted[0];
  return c.json({
    id: r.id,
    employee_id: r.employee_id,
    work_date: r.work_date,
    check_in: r.check_in,
    check_out: null,
    total_hours: null,
    is_active: true,
  });
});

// 3. POST /api/attendance/check-out
attendanceRouter.post("/check-out", async (c) => {
  const user = c.get("user");
  const sql = getDb(c.env.DATABASE_URL);

  const activeRows = await sql`
    SELECT id, employee_id, work_date, check_in, check_out
    FROM attendance
    WHERE employee_id = ${user.id} AND work_date = CURRENT_DATE AND check_out IS NULL
    ORDER BY check_in DESC
    LIMIT 1
  `;

  if (activeRows.length === 0) {
    return c.json({ detail: "No active work session to check out from." }, 400);
  }

  const record = activeRows[0];
  const now = new Date();
  const totalHours = formatDuration(record.check_in, now);

  const updated = await sql`
    UPDATE attendance
    SET check_out = NOW(), total_hours = ${totalHours}
    WHERE id = ${record.id}
    RETURNING id, employee_id, work_date, check_in, check_out, total_hours
  `;

  const r = updated[0];
  return c.json({
    id: r.id,
    employee_id: r.employee_id,
    work_date: r.work_date,
    check_in: r.check_in,
    check_out: r.check_out,
    total_hours: r.total_hours,
    is_active: false,
  });
});

// 4. GET /api/attendance/admin-summary
attendanceRouter.get(
  "/admin-summary",
  requireRoles("super_admin", "admin", "sub_admin"),
  async (c) => {
    const user = c.get("user");
    const sql = getDb(c.env.DATABASE_URL);

    let allowedEmployeeIds: string[] | null = null;
    if (user.role === "sub_admin") {
      const subAdminRows = await sql`
        SELECT employee_id FROM sub_admin_assignments WHERE sub_admin_id = ${user.id} AND active = true AND employee_id IS NOT NULL
      `;
      allowedEmployeeIds = subAdminRows.map((r: any) => String(r.employee_id));
    }

    let records: any[];
    if (allowedEmployeeIds && allowedEmployeeIds.length > 0) {
      records = await sql`
        SELECT a.*, u.name as employee_name, u.email as employee_email
        FROM attendance a
        JOIN users u ON u.id = a.employee_id
        WHERE a.work_date = CURRENT_DATE AND a.employee_id = ANY(${allowedEmployeeIds})
        ORDER BY a.check_in DESC
      `;
    } else if (allowedEmployeeIds && allowedEmployeeIds.length === 0) {
      records = [];
    } else {
      records = await sql`
        SELECT a.*, u.name as employee_name, u.email as employee_email
        FROM attendance a
        JOIN users u ON u.id = a.employee_id
        WHERE a.work_date = CURRENT_DATE
        ORDER BY a.check_in DESC
      `;
    }

    const uniqueEmployees = new Set(records.map((r) => String(r.employee_id)));
    const checkedOutCount = records.filter((r) => r.check_out !== null).length;
    const workingNowCount = records.filter((r) => r.check_out === null).length;

    const activeEmployees = records.map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      name: r.employee_name,
      email: r.employee_email,
      work_date: r.work_date,
      check_in: r.check_in,
      check_out: r.check_out,
      total_hours: r.total_hours,
      is_active: r.check_out === null,
    }));

    return c.json({
      present_today: uniqueEmployees.size,
      checked_in: records.length,
      checked_out: checkedOutCount,
      working_now: workingNowCount,
      active_employees: activeEmployees,
    });
  }
);
