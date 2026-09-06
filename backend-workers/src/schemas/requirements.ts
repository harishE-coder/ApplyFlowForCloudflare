/**
 * Zod Validation Schemas for Requirements Module (Workers).
 * Strictly mirrors FastAPI RequirementCreate and RequirementUpdate.
 */

import { z } from "zod";

export const RequirementCreateSchema = z.object({
  client_id: z.string().uuid().nullable().optional(),
  company: z.string().min(1, "Company is required"),
  job_title: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  role_code: z.string().nullable().optional(),
  job_url: z.string().nullable().optional(),
  priority: z.enum(["High", "Medium", "Low"]).default("Medium"),
  notes: z.string().nullable().optional(),
  status: z.enum(["active", "done", "archived"]).default("active"),
  assignment_type: z.enum(["all", "individual"]).default("all"),
  assigned_employee_id: z.string().uuid().nullable().optional(),
  assigned_employee: z.string().nullable().optional(),
});

export const RequirementUpdateSchema = z.object({
  company: z.string().min(1).optional(),
  job_title: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  role_code: z.string().nullable().optional(),
  job_url: z.string().nullable().optional(),
  priority: z.enum(["High", "Medium", "Low"]).optional(),
  notes: z.string().nullable().optional(),
  status: z.enum(["active", "done", "archived"]).optional(),
  assignment_type: z.enum(["all", "individual"]).optional(),
  assigned_employee_id: z.string().uuid().nullable().optional(),
  assigned_employee: z.string().nullable().optional(),
});

export type RequirementCreateInput = z.infer<typeof RequirementCreateSchema>;
export type RequirementUpdateInput = z.infer<typeof RequirementUpdateSchema>;
