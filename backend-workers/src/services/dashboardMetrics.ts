/**
 * Shared Dashboard Metrics Service
 * Single source of truth for dashboard statistics, aggregations, and trends across ApplyFlow.
 * Uses IST ('Asia/Kolkata') timezone-safe boundary filtering.
 */

export const APP_TIMEZONE = "Asia/Kolkata";

export type DateRangeType =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "this_month"
  | "month"
  | "all"
  | "custom";

export interface MetricStats {
  total: number;
  today: number;
  yesterday: number;
  trend: number;
  count: number;
  range: string;
}

export interface MetricScope {
  clientId?: string | null;
  employeeId?: string | null;
  targetClientIds?: string[] | null;
  targetEmployeeIds?: string[] | null;
}

export interface TeamPerformanceMaps {
  todayUploadsMap: Record<string, number>;
  yesterdayUploadsMap: Record<string, number>;
  totalUploadsMap: Record<string, number>;
  todayAppsMap: Record<string, number>;
  yesterdayAppsMap: Record<string, number>;
  totalAppsMap: Record<string, number>;
}

export interface DailyTrendPoint {
  date: string;
  uploads: number;
  applications: number;
  target: number;
}

/**
 * Returns SQL condition string for date filtering in IST timezone.
 * @param column SQL expression representing timestamp column (e.g. 'COALESCE(created_at, upload_date)')
 * @param range Date range keyword ('today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'month' | 'custom' | 'all')
 * @param customDate Optional custom date string 'YYYY-MM-DD'
 */
export function buildDateFilter(
  column: string,
  range: DateRangeType | string = "today",
  customDate?: string | null
): string {
  const norm = String(range || "today").toLowerCase().replace(/-/g, "_");
  const colIst = `(${column} AT TIME ZONE '${APP_TIMEZONE}')::date`;
  const nowIst = `(NOW() AT TIME ZONE '${APP_TIMEZONE}')`;

  if (norm === "today") {
    return `${colIst} = ${nowIst}::date`;
  }
  if (norm === "yesterday") {
    return `${colIst} = (${nowIst} - INTERVAL '1 day')::date`;
  }
  if (norm === "last7" || norm === "last_7" || norm === "7days" || norm === "week") {
    return `${colIst} >= (${nowIst} - INTERVAL '6 days')::date AND ${colIst} <= ${nowIst}::date`;
  }
  if (norm === "last30" || norm === "last_30" || norm === "30days") {
    return `${colIst} >= (${nowIst} - INTERVAL '29 days')::date AND ${colIst} <= ${nowIst}::date`;
  }
  if (norm === "this_month" || norm === "month") {
    return `DATE_TRUNC('month', (${column} AT TIME ZONE '${APP_TIMEZONE}')) = DATE_TRUNC('month', ${nowIst})`;
  }
  if (norm === "custom" && customDate && /^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
    return `${colIst} = '${customDate}'::date`;
  }
  if (norm === "all") {
    return "1=1";
  }
  return `${colIst} = ${nowIst}::date`;
}

/**
 * Trend calculation:
 * Returns percentage change between today and yesterday.
 * Handles zero baseline and rounds symmetrically.
 */
export function calculateTrend(todayCount: number, yesterdayCount: number): number {
  const today = Number(todayCount);
  const yesterday = Number(yesterdayCount);

  if (yesterday === 0) {
    return today > 0 ? 100 : 0;
  }
  const pct = ((today - yesterday) / yesterday) * 100;
  return pct < 0 ? -Math.round(Math.abs(pct)) : Math.round(pct);
}

/**
 * Single source of truth for Resume statistics across Admin, Employee, and Client dashboards.
 * Supports date range parameter ('today' | 'yesterday' | 'last7' | 'last30' | 'month' | 'custom').
 */
export async function getResumeStats(
  sql: any,
  scope: MetricScope = {},
  range: DateRangeType | string = "today",
  customDate?: string | null
): Promise<MetricStats> {
  const { clientId, employeeId, targetClientIds, targetEmployeeIds } = scope;

  // Empty scope array means user has 0 allowed items -> instant zero stats
  if (
    (targetClientIds !== undefined && targetClientIds !== null && targetClientIds.length === 0) ||
    (targetEmployeeIds !== undefined && targetEmployeeIds !== null && targetEmployeeIds.length === 0)
  ) {
    return { total: 0, today: 0, yesterday: 0, trend: 0, count: 0, range: String(range) };
  }

  const conditions: string[] = [];
  const params: any[] = [];
  let pIdx = 1;

  if (clientId) {
    conditions.push(`client_id = $${pIdx++}`);
    params.push(clientId);
  }
  if (employeeId) {
    conditions.push(`uploaded_by = $${pIdx++}`);
    params.push(employeeId);
  }
  if (targetClientIds && targetClientIds.length > 0) {
    conditions.push(`client_id = ANY($${pIdx++})`);
    params.push(targetClientIds);
  }
  if (targetEmployeeIds && targetEmployeeIds.length > 0) {
    conditions.push(`uploaded_by = ANY($${pIdx++})`);
    params.push(targetEmployeeIds);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const todayFilter = buildDateFilter("COALESCE(created_at, upload_date)", "today");
  const yesterdayFilter = buildDateFilter("COALESCE(created_at, upload_date)", "yesterday");
  const rangeFilter = buildDateFilter("COALESCE(created_at, upload_date)", range, customDate);

  const queryStr = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ${todayFilter})::int AS today,
      COUNT(*) FILTER (WHERE ${yesterdayFilter})::int AS yesterday,
      COUNT(*) FILTER (WHERE ${rangeFilter})::int AS range_count
    FROM resumes
    ${whereClause}
  `;

  const res = await (sql as any)(queryStr, params);
  const total = Number(res[0]?.total) || 0;
  const today = Number(res[0]?.today) || 0;
  const yesterday = Number(res[0]?.yesterday) || 0;
  const rangeCount = res[0]?.range_count !== undefined ? Number(res[0]?.range_count) : today;
  const trend = calculateTrend(today, yesterday);

  return {
    total,
    today,
    yesterday,
    trend,
    count: rangeCount,
    range: String(range),
  };
}

/**
 * Single source of truth for Application statistics across Admin, Employee, and Client dashboards.
 * Supports date range parameter ('today' | 'yesterday' | 'last7' | 'last30' | 'month' | 'custom').
 */
export async function getApplicationStats(
  sql: any,
  scope: MetricScope = {},
  range: DateRangeType | string = "today",
  customDate?: string | null
): Promise<MetricStats> {
  const { clientId, employeeId, targetClientIds, targetEmployeeIds } = scope;

  // Empty scope array means user has 0 allowed items -> instant zero stats
  if (
    (targetClientIds !== undefined && targetClientIds !== null && targetClientIds.length === 0) ||
    (targetEmployeeIds !== undefined && targetEmployeeIds !== null && targetEmployeeIds.length === 0)
  ) {
    return { total: 0, today: 0, yesterday: 0, trend: 0, count: 0, range: String(range) };
  }

  const conditions: string[] = [];
  const params: any[] = [];
  let pIdx = 1;

  if (clientId) {
    conditions.push(`client_id = $${pIdx++}`);
    params.push(clientId);
  }
  if (employeeId) {
    conditions.push(`employee_id = $${pIdx++}`);
    params.push(employeeId);
  }
  if (targetClientIds && targetClientIds.length > 0) {
    conditions.push(`client_id = ANY($${pIdx++})`);
    params.push(targetClientIds);
  }
  if (targetEmployeeIds && targetEmployeeIds.length > 0) {
    conditions.push(`employee_id = ANY($${pIdx++})`);
    params.push(targetEmployeeIds);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const todayFilter = buildDateFilter("COALESCE(applied_date, created_at)", "today");
  const yesterdayFilter = buildDateFilter("COALESCE(applied_date, created_at)", "yesterday");
  const rangeFilter = buildDateFilter("COALESCE(applied_date, created_at)", range, customDate);

  const queryStr = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ${todayFilter})::int AS today,
      COUNT(*) FILTER (WHERE ${yesterdayFilter})::int AS yesterday,
      COUNT(*) FILTER (WHERE ${rangeFilter})::int AS range_count
    FROM applications
    ${whereClause}
  `;

  const res = await (sql as any)(queryStr, params);
  const total = Number(res[0]?.total) || 0;
  const today = Number(res[0]?.today) || 0;
  const yesterday = Number(res[0]?.yesterday) || 0;
  const rangeCount = res[0]?.range_count !== undefined ? Number(res[0]?.range_count) : today;
  const trend = calculateTrend(today, yesterday);

  return {
    total,
    today,
    yesterday,
    trend,
    count: rangeCount,
    range: String(range),
  };
}

/**
 * Recruiter team performance aggregation maps (total, today, yesterday per recruiter in IST).
 */
export async function getTeamPerformanceMaps(sql: any, empIds: string[]): Promise<TeamPerformanceMaps> {
  if (!empIds || empIds.length === 0) {
    return {
      todayUploadsMap: {},
      yesterdayUploadsMap: {},
      totalUploadsMap: {},
      todayAppsMap: {},
      yesterdayAppsMap: {},
      totalAppsMap: {},
    };
  }

  const todayResFilter = buildDateFilter("COALESCE(created_at, upload_date)", "today");
  const yesterdayResFilter = buildDateFilter("COALESCE(created_at, upload_date)", "yesterday");
  const todayAppsFilter = buildDateFilter("COALESCE(applied_date, created_at)", "today");
  const yesterdayAppsFilter = buildDateFilter("COALESCE(applied_date, created_at)", "yesterday");

  const resumesQueryStr = `
    SELECT
      uploaded_by AS employee_id,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ${todayResFilter})::int AS today,
      COUNT(*) FILTER (WHERE ${yesterdayResFilter})::int AS yesterday
    FROM resumes
    WHERE uploaded_by = ANY($1)
    GROUP BY uploaded_by
  `;

  const appsQueryStr = `
    SELECT
      employee_id,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE ${todayAppsFilter})::int AS today,
      COUNT(*) FILTER (WHERE ${yesterdayAppsFilter})::int AS yesterday
    FROM applications
    WHERE employee_id = ANY($1)
    GROUP BY employee_id
  `;

  const [resumesRows, appsRows] = await Promise.all([
    (sql as any)(resumesQueryStr, [empIds]),
    (sql as any)(appsQueryStr, [empIds]),
  ]);

  const todayUploadsMap: Record<string, number> = {};
  const yesterdayUploadsMap: Record<string, number> = {};
  const totalUploadsMap: Record<string, number> = {};
  for (const r of resumesRows) {
    const eid = String(r.employee_id);
    totalUploadsMap[eid] = Number(r.total) || 0;
    todayUploadsMap[eid] = Number(r.today) || 0;
    yesterdayUploadsMap[eid] = Number(r.yesterday) || 0;
  }

  const todayAppsMap: Record<string, number> = {};
  const yesterdayAppsMap: Record<string, number> = {};
  const totalAppsMap: Record<string, number> = {};
  for (const r of appsRows) {
    const eid = String(r.employee_id);
    totalAppsMap[eid] = Number(r.total) || 0;
    todayAppsMap[eid] = Number(r.today) || 0;
    yesterdayAppsMap[eid] = Number(r.yesterday) || 0;
  }

  return {
    todayUploadsMap,
    yesterdayUploadsMap,
    totalUploadsMap,
    todayAppsMap,
    yesterdayAppsMap,
    totalAppsMap,
  };
}

/**
 * 7-day trend series joining resumes and applications independently in IST timezone.
 */
export async function getSevenDayTrend(sql: any, targetSum: number = 0): Promise<DailyTrendPoint[]> {
  const trendRows = await sql`
    SELECT 
      d.dt::date as date,
      COALESCE(r.uploads, 0)::int as uploads,
      COALESCE(a.applications, 0)::int as applications
    FROM generate_series(
      ((NOW() AT TIME ZONE 'Asia/Kolkata') - INTERVAL '6 days')::date,
      (NOW() AT TIME ZONE 'Asia/Kolkata')::date,
      INTERVAL '1 day'
    ) d(dt)
    LEFT JOIN (
      SELECT (COALESCE(created_at, upload_date) AT TIME ZONE 'Asia/Kolkata')::date as d_date, count(*)::int as uploads
      FROM resumes
      GROUP BY (COALESCE(created_at, upload_date) AT TIME ZONE 'Asia/Kolkata')::date
    ) r ON r.d_date = d.dt::date
    LEFT JOIN (
      SELECT (COALESCE(applied_date, created_at) AT TIME ZONE 'Asia/Kolkata')::date as d_date, count(*)::int as applications
      FROM applications
      GROUP BY (COALESCE(applied_date, created_at) AT TIME ZONE 'Asia/Kolkata')::date
    ) a ON a.d_date = d.dt::date
    ORDER BY d.dt ASC
  `;

  return trendRows.map((r: any) => {
    const dStr = typeof r.date === "string" ? r.date : r.date.toISOString().split("T")[0];
    return {
      date: dStr,
      uploads: Number(r.uploads),
      applications: Number(r.applications),
      target: Math.round(targetSum / 7) || 0,
    };
  });
}
