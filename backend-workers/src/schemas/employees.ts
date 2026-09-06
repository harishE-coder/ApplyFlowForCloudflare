/**
 * Zod Validation Schemas for Employees & Users Module (Workers).
 * Strictly mirrors FastAPI UserCreate, UserUpdate, and ResetPasswordRequest.
 */

import { z } from "zod";

export const UserCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().nullable().optional(),
  role: z.enum(["admin", "sub_admin", "employee", "recruiter", "client"]).default("employee"),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  client_id: z.string().uuid().nullable().optional(),
  assigned_client_ids: z.array(z.string().uuid()).default([]),
});

export const UserUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["admin", "sub_admin", "employee", "recruiter", "client"]).optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
  client_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  assigned_client_ids: z.array(z.string().uuid()).optional(),
});

export const ResetPasswordSchema = z.object({
  new_password: z.string().min(6, "New password must be at least 6 characters"),
});

export type UserCreateInput = z.infer<typeof UserCreateSchema>;
export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
