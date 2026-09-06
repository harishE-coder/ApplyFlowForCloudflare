/**
 * Zod Validation Schemas for Applications Module (Workers).
 * Strictly mirrors FastAPI ApplicationCreate, ApplicationStatusUpdate, ApplicationNotesUpdate.
 */

import { z } from "zod";

export const ApplicationCreateSchema = z.object({
  resume_id: z.string().uuid("Invalid resume UUID"),
  requirement_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  status: z.string().default("Submitted"),
  current_round: z.string().nullable().optional().default("Initial Application"),
});

export const ApplicationStatusUpdateSchema = z.object({
  status: z.string().min(1, "Status is required"),
  current_round: z.string().nullable().optional(),
});

export const ApplicationNotesUpdateSchema = z.object({
  client_notes: z.string().nullable().optional(),
  is_note_shared: z.boolean().default(true),
});

export type ApplicationCreateInput = z.infer<typeof ApplicationCreateSchema>;
export type ApplicationStatusUpdateInput = z.infer<typeof ApplicationStatusUpdateSchema>;
export type ApplicationNotesUpdateInput = z.infer<typeof ApplicationNotesUpdateSchema>;
