import { z } from "zod";

export const AttendanceRecordResponseSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  work_date: z.string().or(z.date()),
  check_in: z.string().or(z.date()),
  check_out: z.string().or(z.date()).nullable().optional(),
  total_hours: z.string().nullable().optional(),
  is_active: z.boolean(),
});

export const AdminAttendanceSummarySchema = z.object({
  present_today: z.number().int().nonnegative(),
  checked_in: z.number().int().nonnegative(),
  checked_out: z.number().int().nonnegative(),
  working_now: z.number().int().nonnegative(),
  active_employees: z.array(z.record(z.string(), z.any())).default([]),
});
