import { z } from "zod";

export const TargetSetRequestSchema = z.object({
  employee_id: z.string().uuid("Invalid employee ID"),
  client_id: z.string().uuid("Invalid client ID"),
  daily_target: z.number().int().positive("Daily target must be greater than 0"),
  status: z.enum(["active", "paused", "ended"]).default("active"),
});

export const TargetResponseSchema = z.object({
  id: z.string().uuid(),
  employee_id: z.string().uuid(),
  employee_name: z.string(),
  client_id: z.string().uuid(),
  client_name: z.string(),
  daily_target: z.number().int(),
  status: z.string(),
  effective_date: z.string().or(z.date()),
});

export const ClientTargetProgressSchema = z.object({
  client_id: z.string().uuid(),
  client_name: z.string(),
  daily_target: z.number().int(),
  achieved_count: z.number().int(),
  completion_percentage: z.number(),
});

export const EmployeeTargetProgressResponseSchema = z.object({
  total_target: z.number().int(),
  total_achieved: z.number().int(),
  overall_percentage: z.number(),
  client_breakdown: z.array(ClientTargetProgressSchema),
});
