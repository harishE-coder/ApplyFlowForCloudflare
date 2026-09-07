/**
 * Zod Validation Schemas for Clients Module (Workers).
 * Strictly mirrors FastAPI ClientCreate, ClientUpdate, and AssignEmployeesRequest.
 */

import { z } from "zod";

export const RecruiterAssignmentItemSchema = z.object({
  employee_id: z.string().uuid("Invalid employee UUID"),
  is_primary: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const ClientCreateSchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  contact_person: z.string().nullable().optional(),
  email: z.string().email("Invalid email address").nullable().optional(),
  phone: z.string().nullable().optional(),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  logo_url: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
});

export const ClientUpdateSchema = z.object({
  company_name: z.string().min(1).optional(),
  contact_person: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  logo_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  employee_ids: z.array(z.string().uuid()).optional(),
  assigned_employee_ids: z.array(z.string().uuid()).optional(),
  assignments: z.array(RecruiterAssignmentItemSchema).optional(),
});

export const AssignEmployeesSchema = z.object({
  employee_ids: z.array(z.string().uuid()).optional(),
  employee_id: z.string().uuid().optional(),
  assignments: z.array(RecruiterAssignmentItemSchema).optional(),
});

export type ClientCreateInput = z.infer<typeof ClientCreateSchema>;
export type ClientUpdateInput = z.infer<typeof ClientUpdateSchema>;
export type AssignEmployeesInput = z.infer<typeof AssignEmployeesSchema>;
